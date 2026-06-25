// Shared helpers for the wallet-management actions. Each action spawns a
// short-lived SubContainer with the faucet image, mounts the config volume
// (for /etc/elektron-faucet/config.php) and runs a small PHP one-liner that
// reads the RPC credentials out of the `settings` table the admin panel
// writes to, then issues a JSON-RPC call against the configured elektrond
// node.
//
// All wallet ops route through the elektrond RPC, because elektrond-startos
// does not expose its own wallet UI. The faucet admin panel is the single
// source of truth for the RPC connection details.

import { sdk } from '../sdk'

export const IMAGE = { imageId: 'elektron-net-faucet' as const }

export const sharedMounts = () =>
  sdk.Mounts.of().mountVolume({
    volumeId: 'main',
    subpath: 'config',
    mountpoint: '/etc/elektron-faucet',
    readonly: false,
  })

/**
 * PHP script that issues an elektrond RPC call using the settings the admin
 * panel saved. Reads $RPC_METHOD + $RPC_PARAMS_JSON + optional $RPC_WALLET
 * (overrides the configured wallet_name) from env, prints the JSON result
 * on stdout (or the JSON error to stderr + exit 1).
 */
export const RPC_PHP = String.raw`
$cfg = require '/etc/elektron-faucet/config.php';
$pdo = new PDO(
    sprintf("mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4",
        $cfg["db_host"], $cfg["db_port"], $cfg["db_name"]),
    $cfg["db_user"], $cfg["db_pass"],
    [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
     PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]
);
$rows = $pdo->query("SELECT \`key\`, \`value\` FROM settings")->fetchAll();
$s = [];
foreach ($rows as $r) $s[$r["key"]] = $r["value"];

$host   = $s["rpc_host"]   ?? "127.0.0.1";
$port   = (int)($s["rpc_port"]   ?? 8332);
$user   = $s["rpc_user"]   ?? "";
$pass   = $s["rpc_pass"]   ?? "";
$wallet = getenv("RPC_WALLET") !== false && getenv("RPC_WALLET") !== ""
            ? getenv("RPC_WALLET")
            : ($s["wallet_name"] ?? "");

if ($user === "" || $pass === "") {
    fwrite(STDERR, "[wallet-rpc] RPC user/password not configured. Open admin.php and set RPC Host/User/Password first.\n");
    exit(2);
}

$scheme = preg_match('~^https?://~', $host) ? "" : "http://";
$base   = $scheme . $host . ":" . $port . "/";
if ($wallet !== "") $base .= "wallet/" . rawurlencode($wallet);

$method = getenv("RPC_METHOD") ?: "";
$params = json_decode(getenv("RPC_PARAMS_JSON") ?: "[]", true);
if (!is_array($params)) $params = [];

$body = json_encode([
    "jsonrpc" => "1.0",
    "id"      => "faucet-startos",
    "method"  => $method,
    "params"  => $params,
], JSON_THROW_ON_ERROR);

$ch = curl_init($base);
curl_setopt_array($ch, [
    CURLOPT_POST           => true,
    CURLOPT_POSTFIELDS     => $body,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_USERPWD        => $user . ":" . $pass,
    CURLOPT_HTTPHEADER     => ["Content-Type: application/json"],
    CURLOPT_TIMEOUT        => 60,
    CURLOPT_CONNECTTIMEOUT => 10,
]);
$resp = curl_exec($ch);
$errno = curl_errno($ch);
$errstr = curl_error($ch);
$code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
curl_close($ch);

if ($errno !== 0) {
    fwrite(STDERR, "[wallet-rpc] curl error $errno: $errstr (URL: $base)\n");
    exit(3);
}
$data = json_decode((string)$resp, true);
if (!is_array($data)) {
    fwrite(STDERR, "[wallet-rpc] HTTP $code, invalid JSON: " . substr((string)$resp, 0, 300) . "\n");
    exit(4);
}
if (!empty($data["error"])) {
    fwrite(STDERR, "[wallet-rpc] RPC error: " . json_encode($data["error"]) . "\n");
    exit(5);
}
echo json_encode($data["result"] ?? null, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
`

export type ExecOutcome = {
  stdout: string
  stderr: string
  exitCode: number | null
}

export async function rpcExec(
  sub: any,
  method: string,
  params: unknown[],
  walletOverride?: string,
): Promise<ExecOutcome> {
  const out = await sub.exec(['php', '-r', RPC_PHP], {
    env: {
      RPC_METHOD: method,
      RPC_PARAMS_JSON: JSON.stringify(params),
      ...(walletOverride !== undefined ? { RPC_WALLET: walletOverride } : {}),
    },
  })
  return {
    stdout: (out.stdout ?? '').toString(),
    stderr: (out.stderr ?? '').toString(),
    exitCode: (out.exitCode as number | null) ?? null,
  }
}
