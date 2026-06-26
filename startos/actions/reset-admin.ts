import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

const inputSpec = InputSpec.of({
  username: Value.text({
    name: 'Admin Username',
    description:
      'Username for the faucet admin panel. Defaults to "admin" if left blank.',
    required: false,
    default: 'admin',
    placeholder: 'admin',
    maxLength: 64,
  }),
  password: Value.text({
    name: 'Admin Password',
    description:
      'New password for the faucet admin panel (minimum 10 characters). Leave blank to generate a random 24-character one.',
    required: false,
    default: null,
    placeholder: '(blank = generate random)',
    masked: true,
    minLength: 10,
  }),
})

// Rotates the admin user's password (and optionally username). The faucet
// PHP code authenticates against the `admin_users` row in MariaDB, so we
// upsert that row directly via the same PDO config the app uses. We also
// rewrite $CRED_DIR/admin_{username,password} so the "Show Admin
// Credentials" action surfaces the same values on the next run.
//
// Everything is done in a single PHP script: hash the password with
// PASSWORD_BCRYPT (universally available — argon2 support is a build-time
// option), open the PDO connection, run the upsert, write the files, and
// only THEN echo the password back over stdout. If any step throws the
// PHP exit code is non-zero and the surrounding TypeScript surfaces the
// stderr so the operator sees the real failure instead of an empty
// "Password: " line.
//
// Requires the service to be running so mariadb is reachable on
// 127.0.0.1:3306.
export const resetAdmin = sdk.Action.withInput(
  'reset-admin-password',

  async ({ effects }) => ({
    name: 'Reset Admin Password',
    description:
      'Rotate the username and/or password for the faucet admin panel (/admin.php).',
    warning:
      'Any admin sessions currently logged in remain valid until they expire; revoke them from the admin panel if needed.',
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  inputSpec,

  async () => ({ username: 'admin', password: null }),

  async ({ effects, input }) => {
    const sub = await sdk.SubContainer.of(
      effects,
      { imageId: 'elektron-net-faucet' },
      sdk.Mounts.of().mountVolume({
        volumeId: 'main',
        subpath: 'config',
        mountpoint: '/etc/elektron-faucet',
        readonly: false,
      }),
      'reset-admin-password',
    )

    try {
      const username = (input.username || 'admin').trim() || 'admin'

      // Single PHP script: generate the password (if not supplied), hash
      // it with PASSWORD_BCRYPT, upsert into MariaDB, persist the cleartext
      // copy to /etc/elektron-faucet/admin_{username,password}, then echo
      // ONLY the password on stdout. Any error throws and `php -r`
      // returns a non-zero exit code.
      const phpScript = `
        $username = getenv("RESET_USERNAME") ?: "admin";
        $supplied = getenv("RESET_PASSWORD") ?: "";
        if ($supplied !== "") {
            $password = $supplied;
        } else {
            // 24 hex chars (12 random bytes)
            $password = bin2hex(random_bytes(12));
        }

        $hash = password_hash($password, PASSWORD_BCRYPT);
        if (!is_string($hash) || $hash === "") {
            fwrite(STDERR, "[reset-admin] password_hash() failed\\n");
            exit(2);
        }

        $cfg = require "/etc/elektron-faucet/config.php";
        $pdo = new PDO(
            sprintf("mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4",
                $cfg["db_host"], $cfg["db_port"], $cfg["db_name"]),
            $cfg["db_user"], $cfg["db_pass"],
            [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
        );

        // Upsert: matches an existing row by the unique \`username\`
        // column; if the operator renames the user, the old row stays
        // disabled (password_verify against the stale hash will simply
        // not match the new password).
        $stmt = $pdo->prepare(
            "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)"
        );
        $stmt->execute([$username, $hash]);

        // Verify the row we just wrote actually exists with the new hash.
        $check = $pdo->prepare("SELECT password_hash FROM admin_users WHERE username = ?");
        $check->execute([$username]);
        $row = $check->fetch(PDO::FETCH_ASSOC);
        if (!$row || $row["password_hash"] !== $hash) {
            fwrite(STDERR, "[reset-admin] post-write verification failed\\n");
            exit(3);
        }
        if (!password_verify($password, $row["password_hash"])) {
            fwrite(STDERR, "[reset-admin] password_verify() failed against stored hash\\n");
            exit(4);
        }

        // Persist cleartext copies for "Show Admin Credentials".
        $dir = "/etc/elektron-faucet";
        if (file_put_contents($dir . "/admin_username", $username) === false) {
            fwrite(STDERR, "[reset-admin] failed to write admin_username\\n");
            exit(5);
        }
        if (file_put_contents($dir . "/admin_password", $password) === false) {
            fwrite(STDERR, "[reset-admin] failed to write admin_password\\n");
            exit(6);
        }
        chmod($dir . "/admin_username", 0600);
        chmod($dir . "/admin_password", 0600);

        echo $password;
      `

      const out = await sub.exec(['php', '-r', phpScript], {
        env: {
          RESET_USERNAME: username,
          RESET_PASSWORD: input.password ?? '',
        },
      })

      const exitCode = (out.exitCode as number | null) ?? 0
      const stderr = (out.stderr ?? '').toString().trim()
      const pass = (out.stdout ?? '').toString().trim()

      if (exitCode !== 0 || pass === '') {
        throw new Error(
          stderr ||
            `Reset Admin Password failed (exit ${exitCode}). Make sure the service is fully started so MariaDB is reachable on 127.0.0.1:3306.`,
        )
      }

      return {
        version: '1' as const,
        title: 'Admin password updated',
        message:
          `Use the credentials below at /admin.php.\n\n` +
          `Username: ${username}\n` +
          `Password: ${pass}\n\n` +
          `These are also stored in /etc/elektron-faucet/admin_{username,password}\n` +
          `and surfaced by the "Show Admin Credentials" action.`,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)
