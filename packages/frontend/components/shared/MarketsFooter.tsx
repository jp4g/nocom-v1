import { Layers } from 'lucide-react';

export default function MarketsFooter() {
  return (
    <footer className="border-t border-surface-border mt-auto py-12 bg-black">
      <div className="max-w-[1400px] mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2 text-text-muted">
          <Layers className="w-4 h-4" />
          <span className="text-xs font-mono">Ghost Protocol © 2024</span>
        </div>
        <div className="flex gap-6">
          <a href="#" className="text-xs text-text-muted hover:text-white transition-colors">Terms</a>
          <a href="#" className="text-xs text-text-muted hover:text-white transition-colors">Privacy</a>
          <a href="#" className="text-xs text-text-muted hover:text-white transition-colors">Docs</a>
        </div>
      </div>
    </footer>
  );
}
