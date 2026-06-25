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
      'New password for the faucet admin panel (minimum 10 characters). Leave blank to generate a random one.',
    required: false,
    default: null,
    placeholder: '(blank = generate random)',
    masked: true,
    minLength: 10,
  }),
})

// Rotates the admin user's password (and optionally username). The
// faucet's PHP code reads admin credentials out of MariaDB, so we update
// `admin_users` directly via the same PDO config the app uses. We then
// rewrite $CRED_DIR/admin_{username,password} so Show Admin Credentials
// reflects the new value.
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
      const script = `
        set -eu
        DIR=/etc/elektron-faucet
        USER='${username.replace(/'/g, "'\\''")}'
        if [ -n "$NEW_PASS" ]; then
            PASS="$NEW_PASS"
        else
            PASS=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \\n')
        fi
        printf '%s' "$USER" > "$DIR/admin_username"
        printf '%s' "$PASS" > "$DIR/admin_password"
        chmod 600 "$DIR/admin_username" "$DIR/admin_password"

        HASH=$(ADMIN_PASS="$PASS" php -r 'echo password_hash(getenv("ADMIN_PASS"), PASSWORD_ARGON2ID);')

        ADMIN_USER="$USER" ADMIN_HASH="$HASH" php -r '
            $cfg = require "/etc/elektron-faucet/config.php";
            $pdo = new PDO(
                sprintf("mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4",
                    $cfg["db_host"], $cfg["db_port"], $cfg["db_name"]),
                $cfg["db_user"], $cfg["db_pass"],
                [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
            );
            $stmt = $pdo->prepare(
                "INSERT INTO admin_users (username, password_hash) VALUES (?, ?)
                 ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)"
            );
            $stmt->execute([getenv("ADMIN_USER"), getenv("ADMIN_HASH")]);
        '
        printf '%s' "$PASS"
      `

      const out = await sub.exec(['sh', '-c', script], {
        env: { NEW_PASS: input.password ?? '' },
      })
      const pass = out.stdout.toString().trim()

      return {
        version: '1' as const,
        title: 'Admin password updated',
        message:
          `Use the credentials below at /admin.php.\n\n` +
          `Username: ${username}\n` +
          `Password: ${pass}\n\n` +
          `"Show Admin Credentials" will surface the same values later.`,
        result: null,
      }
    } finally {
      await sub.destroy?.()
    }
  },
)
