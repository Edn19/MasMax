import { ChevronLeft, ChevronRight } from 'lucide-react';
import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from 'react';

export function HorizontalRail({ label, children }: { label: string; children: ReactNode }) {
  const rail = useRef<HTMLDivElement | null>(null);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const move = (direction: number) => rail.current?.scrollBy({ left: direction * Math.max(rail.current.clientWidth * 0.8, 280), behavior: 'smooth' });

  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => { setCanBack(element.scrollLeft > 4); setCanForward(element.scrollLeft + element.clientWidth < element.scrollWidth - 4); };
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    update();
    return () => { observer.disconnect(); element.removeEventListener('scroll', update); };
  }, [children]);

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    move(event.key === 'ArrowLeft' ? -1 : 1);
    event.preventDefault();
  };

  return <div className="relative" role="region" aria-label={label}>
    <div className="mb-2 hidden min-h-11 justify-end gap-2 sm:flex">{(canBack || canForward) && <>
      <button type="button" disabled={!canBack} aria-label={`Ver anteriores en ${label}`} onClick={() => move(-1)} className="icon-button"><ChevronLeft size={18} /></button>
      <button type="button" disabled={!canForward} aria-label={`Ver siguientes en ${label}`} onClick={() => move(1)} className="icon-button"><ChevronRight size={18} /></button>
    </>}</div>
    <div ref={rail} tabIndex={0} onKeyDown={keys} className="content-rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:gap-5 sm:px-0">{children}</div>
  </div>;
}
