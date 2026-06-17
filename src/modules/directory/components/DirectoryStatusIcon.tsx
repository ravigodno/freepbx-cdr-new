import React from 'react';
import { AlertTriangle, Ban } from 'lucide-react';
import { DirectoryEntry } from '../../../types';

const StatusSvg = ({
  type,
  className = "h-3.5 w-3.5"
}: {
  type: 'client' | 'internal' | 'supplier' | 'government';
  className?: string;
}) => {
  const paths: Record<string, string> = {
    client: "M232.5 136L320 229L407.5 136L232.5 136zM447.9 163.1L375.6 240L504.6 240L448 163.1zM497.9 288L142.1 288L320 484.3L497.9 288zM135.5 240L264.5 240L192.2 163.1L135.6 240zM569.8 280.1L337.8 536.1C333.3 541.1 326.8 544 320 544C313.2 544 306.8 541.1 302.2 536.1L70.2 280.1C62.5 271.6 61.9 258.9 68.7 249.7L180.7 97.7C185.2 91.6 192.4 87.9 200 87.9L440 87.9C447.6 87.9 454.8 91.5 459.3 97.7L571.3 249.7C578.1 258.9 577.4 271.6 569.8 280.1z",
    internal: "M304 70.1C313.1 61.9 326.9 61.9 336 70.1L568 278.1C577.9 286.9 578.7 302.1 569.8 312C560.9 321.9 545.8 322.7 535.9 313.8L527.9 306.6L527.9 511.9C527.9 547.2 499.2 575.9 463.9 575.9L175.9 575.9C140.6 575.9 111.9 547.2 111.9 511.9L111.9 306.6L103.9 313.8C94 322.6 78.9 321.8 70 312C61.1 302.2 62 287 71.8 278.1L304 70.1zM320 120.2L160 263.7L160 512C160 520.8 167.2 528 176 528L224 528L224 424C224 384.2 256.2 352 296 352L344 352C383.8 352 416 384.2 416 424L416 528L464 528C472.8 528 480 520.8 480 512L480 263.7L320 120.3zM272 528L368 528L368 424C368 410.7 357.3 400 344 400L296 400C282.7 400 272 410.7 272 424L272 528z",
    supplier: "M96 144C87.2 144 80 151.2 80 160L80 448C80 456.8 87.2 464 96 464L99.3 464C109.7 427.1 143.7 400 184 400C224.3 400 258.2 427.1 268.7 464L371.3 464C376.2 446.6 386.4 431.3 400 420.1L400 160C400 151.2 392.8 144 384 144L96 144zM99.3 512L96 512C60.7 512 32 483.3 32 448L32 160C32 124.7 60.7 96 96 96L384 96C419.3 96 448 124.7 448 160L448 192L503.4 192C520.4 192 536.7 198.7 548.7 210.7L589.3 251.3C601.3 263.3 608 279.6 608 296.6L608 448C608 483.3 579.3 512 544 512L540.7 512C530.3 548.9 496.3 576 456 576C415.7 576 381.8 548.9 371.3 512L268.7 512C258.3 548.9 224.3 576 184 576C143.7 576 109.8 548.9 99.3 512zM448 320L560 320L560 296.6C560 292.4 558.3 288.3 555.3 285.3L514.7 244.7C511.7 241.7 507.6 240 503.4 240L448 240L448 320zM448 368L448 400.4C450.6 400.2 453.3 400 456 400C496.3 400 530.2 427.1 540.7 464L544 464C552.8 464 560 456.8 560 448L560 368L448 368zM184 528C206.1 528 224 510.1 224 488C224 465.9 206.1 448 184 448C161.9 448 144 465.9 144 488C144 510.1 161.9 528 184 528zM456 528C478.1 528 496 510.1 496 488C496 465.9 478.1 448 456 448C433.9 448 416 465.9 416 488C416 510.1 433.9 528 456 528z",
    government: "M144 88C144 74.7 133.3 64 120 64C106.7 64 96 74.7 96 88L96 552C96 565.3 106.7 576 120 576C133.3 576 144 565.3 144 552L144 452L224.3 431.9C265.4 421.6 308.9 426.4 346.8 445.3C391 467.4 442.3 470.1 488.5 452.7L523.2 439.7C535.7 435 544 423.1 544 409.7L544 130C544 107 519.8 92 499.2 102.3L489.6 107.1C443.3 130.3 388.8 130.3 342.5 107.1C307.4 89.5 267.1 85.1 229 94.6L144 116L144 88zM144 165.5L240.6 141.3C267.6 134.6 296.1 137.7 321 150.1C375.9 177.5 439.7 179.8 496 156.9L496 398.7L471.6 407.8C437.9 420.4 400.4 418.5 368.2 402.4C320 378.3 264.9 372.3 212.6 385.3L144 402.5L144 165.5z"
  };

  return (
    <svg viewBox="0 0 640 640" className={className} fill="currentColor" aria-hidden="true">
      <path d={paths[type]} />
    </svg>
  );
};

export function DirectoryStatusIcon({ entry }: { entry: DirectoryEntry }) {
  const title = entry.isBlacklisted
    ? 'Черный список'
    : entry.isSpam
      ? 'Спам'
      : entry.type === 'internal'
        ? 'Внутренний'
        : entry.type === 'supplier'
          ? 'Поставщик'
          : entry.type === 'government'
            ? 'Госорган'
            : 'Клиент';

  const cls = entry.isBlacklisted
    ? 'bg-slate-900 text-white border-slate-900'
    : entry.isSpam
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : entry.type === 'internal'
        ? 'bg-blue-50 text-blue-700 border-blue-200'
        : entry.type === 'supplier'
          ? 'bg-orange-50 text-orange-700 border-orange-200'
          : entry.type === 'government'
            ? 'bg-purple-50 text-purple-700 border-purple-200'
            : 'bg-emerald-50 text-emerald-700 border-emerald-200';

  return (
    <span
      title={title}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-full border shadow-xs transition-all ${cls}`}
    >
      {entry.isBlacklisted ? (
        <Ban className="h-3.5 w-3.5" />
      ) : entry.isSpam ? (
        <AlertTriangle className="h-3.5 w-3.5" />
      ) : entry.type === 'internal' ? (
        <StatusSvg type="internal" />
      ) : entry.type === 'supplier' ? (
        <StatusSvg type="supplier" />
      ) : entry.type === 'government' ? (
        <StatusSvg type="government" />
      ) : (
        <StatusSvg type="client" />
      )}
    </span>
  );
}
