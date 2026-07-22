import fs from 'node:fs';
import type { LiveVoiceConfig } from './liveVoiceTypes.js';

const DIALPLAN_PATH = '/etc/asterisk/extensions_custom.conf';
const extensionPattern = /^\d{2,8}$/;
const applicationPattern = /^[A-Za-z][A-Za-z0-9_.-]{2,63}$/;
const contextPattern = /^pbxpuls-ai-voice-test(?:-[a-z0-9-]+)?$/;
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function buildLiveDialplanPreview(config: LiveVoiceConfig, existingDialplan?: string) {
  if (!config.testExtension) return { ready: false, code: 'test_extension_not_configured', snippet: null, applySupported: false };
  if (!extensionPattern.test(config.testExtension)) return { ready: false, code: 'invalid_test_extension', snippet: null, applySupported: false };
  if (!applicationPattern.test(config.stasisApplication)) return { ready: false, code: 'invalid_stasis_application', snippet: null, applySupported: false };
  if (!contextPattern.test(config.testContext)) return { ready: false, code: 'invalid_test_context', snippet: null, applySupported: false };
  let current = existingDialplan;
  if (current === undefined) { try { current = fs.readFileSync(DIALPLAN_PATH, 'utf8'); } catch { current = ''; } }
  const exact = new RegExp(`^\\s*exten\\s*=>\\s*${escapeRegex(config.testExtension)}\\s*,`, 'm');
  const conflict = exact.test(current);
  const snippet = `; BEGIN PBXPuls AI Voice Test\n[from-internal-custom]\nexten => ${config.testExtension},1,Gosub(${config.testContext},${config.testExtension},1)\n same => n,Hangup()\n\n[${config.testContext}]\nexten => ${config.testExtension},1,NoOp(PBXPuls controlled AI voice test)\n same => n,Set(__CALLFILENAME=ai-\${FILTER(0-9.,\${UNIQUEID})}.wav)\n same => n,Set(CDR(recordingfile)=\${CALLFILENAME})\n same => n,MixMonitor(\${CALLFILENAME},b)\n same => n,Stasis(${config.stasisApplication},controlled_test)\n same => n,StopMixMonitor()\n same => n,Return()\n; END PBXPuls AI Voice Test`;
  return { ready: !conflict, code: conflict ? 'test_extension_conflict' : null, conflict, snippet, applySupported: false, target: 'extensions_custom.conf', rollback: 'Remove only the BEGIN/END PBXPuls AI Voice Test block, then validate and reload manually.', warning: 'Preview only. PBXPuls does not write or reload the dialplan.' };
}
