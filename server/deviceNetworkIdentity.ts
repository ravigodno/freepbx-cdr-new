import { spawnSync } from 'child_process';

const MAC_PATTERN = /\b([0-9a-f]{2}(?::[0-9a-f]{2}){5})\b/i;
const IPV4_PATTERN = /\b(\d{1,3}(?:\.\d{1,3}){3})\b/;

export function normalizeMacAddress(value: unknown): string {
  const normalized = String(value || '').trim().replace(/-/g, ':').toLowerCase();
  return MAC_PATTERN.test(normalized) && normalized !== '00:00:00:00:00:00' ? normalized : '';
}

export function parseIpNeighborMacs(output: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of String(output || '').split('\n')) {
    const ip = line.match(IPV4_PATTERN)?.[1] || '';
    const mac = normalizeMacAddress(line.match(MAC_PATTERN)?.[1]);
    if (ip && mac) result.set(ip, mac);
  }
  return result;
}

export function readIpNeighborMacs(): Map<string, string> {
  const ipResult = spawnSync('ip', ['neighbor', 'show'], { encoding: 'utf8', timeout: 3000 });
  const ipNeighbors = parseIpNeighborMacs(ipResult.stdout || '');
  if (ipNeighbors.size) return ipNeighbors;

  const arpResult = spawnSync('arp', ['-an'], { encoding: 'utf8', timeout: 3000 });
  return parseIpNeighborMacs(arpResult.stdout || '');
}

function uniqueValues(values: unknown[]): string[] {
  return Array.from(new Set(values.map(value => String(value || '').trim()).filter(Boolean)));
}

export function mergeDeviceNetworkIdentity(currentDevices: any[], previousDevices: any[]): any[] {
  const previousByExt = new Map(previousDevices.map(device => [String(device.ext || ''), device]));
  const previousByMac = new Map<string, any>();
  for (const device of previousDevices) {
    const mac = normalizeMacAddress(device.network?.mac);
    if (mac) previousByMac.set(mac, device);
  }

  return currentDevices.map(device => {
    const currentMac = normalizeMacAddress(device.network?.mac);
    const previous = (currentMac && previousByMac.get(currentMac)) || previousByExt.get(String(device.ext || ''));
    const previousMac = normalizeMacAddress(previous?.network?.mac);
    const mac = currentMac || previousMac;
    const previousIp = String(previous?.ip || previous?.network?.lastIp || '').trim();
    const currentIp = String(device.ip || '').trim();
    const ipChanged = Boolean(previousIp && currentIp && previousIp !== currentIp);
    const previousChanges = Number(previous?.ipChanges || 0);
    const ipHistory = uniqueValues([
      ...(Array.isArray(previous?.network?.ipHistory) ? previous.network.ipHistory : []),
      previousIp,
      currentIp
    ]);
    const macHistory = uniqueValues([
      ...(Array.isArray(previous?.network?.macHistory) ? previous.network.macHistory : []),
      previousMac,
      mac
    ]);

    return {
      ...device,
      ipChanges: previousChanges + (ipChanged ? 1 : 0),
      network: {
        ...(device.network || {}),
        mac,
        lastIp: currentIp || previousIp,
        ipHistory,
        macHistory
      }
    };
  });
}
