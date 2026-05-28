import { useEffect, useRef } from "react";

const config = {
  name: "Original Thinking",
  rotate: true,
  particleCount: 140,
  trailSpan: 0.38,
  durationMs: 7000,
  rotationDurationMs: 28000,
  pulseDurationMs: 4200,
  strokeWidth: 5.5,
  baseRadius: 7,
  detailAmplitude: 3,
  petalCount: 7,
  curveScale: 3.9,
  point(progress: number, detailScale: number, config: any) {
    const t = progress * Math.PI * 2;
    const petals = Math.round(config.petalCount);
    const x =
      config.baseRadius * Math.cos(t) -
      config.detailAmplitude * detailScale * Math.cos(petals * t);
    const y =
      config.baseRadius * Math.sin(t) -
      config.detailAmplitude * detailScale * Math.sin(petals * t);
    return {
      x: 50 + x * config.curveScale,
      y: 50 + y * config.curveScale,
    };
  },
};

function normalizeProgress(progress: number) {
  return ((progress % 1) + 1) % 1;
}

function getDetailScale(time: number) {
  const pulseProgress = (time % config.pulseDurationMs) / config.pulseDurationMs;
  const pulseAngle = pulseProgress * Math.PI * 2;
  return 0.52 + ((Math.sin(pulseAngle + 0.55) + 1) / 2) * 0.48;
}

function getRotation(time: number) {
  if (!config.rotate) return 0;
  return -((time % config.rotationDurationMs) / config.rotationDurationMs) * 360;
}

function buildPath(detailScale: number, steps = 480) {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const point = config.point(index / steps, detailScale, config);
    return `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(" ");
}

function getParticle(index: number, progress: number, detailScale: number) {
  const tailOffset = index / (config.particleCount - 1);
  const point = config.point(
    normalizeProgress(progress - tailOffset * config.trailSpan),
    detailScale,
    config
  );
  const fade = Math.pow(1 - tailOffset, 0.56);
  return {
    x: point.x,
    y: point.y,
    radius: 0.9 + fade * 2.7,
    opacity: 0.04 + fade * 0.96,
  };
}

export function OriginalThinkingLoader({ className = "w-8 h-8" }: { className?: string }) {
  const groupRef = useRef<SVGGElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const particlesRef = useRef<(SVGCircleElement | null)[]>([]);

  useEffect(() => {
    const startedAt = performance.now();
    let animationFrameId: number;

    function render(now: number) {
      const time = now - startedAt;
      const progress = (time % config.durationMs) / config.durationMs;
      const detailScale = getDetailScale(time);

      if (groupRef.current) {
        groupRef.current.setAttribute("transform", `rotate(${getRotation(time)} 50 50)`);
      }

      if (pathRef.current) {
        pathRef.current.setAttribute("d", buildPath(detailScale));
      }

      particlesRef.current.forEach((node, index) => {
        if (!node) return;
        const particle = getParticle(index, progress, detailScale);
        node.setAttribute("cx", particle.x.toFixed(2));
        node.setAttribute("cy", particle.y.toFixed(2));
        node.setAttribute("r", particle.radius.toFixed(2));
        node.setAttribute("opacity", particle.opacity.toFixed(3));
      });

      animationFrameId = requestAnimationFrame(render);
    }

    animationFrameId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <div className={`flex items-center justify-center ${className}`}>
      <svg
        viewBox="0 0 100 100"
        fill="none"
        aria-hidden="true"
        className="w-full h-full overflow-visible text-muted-foreground"
      >
        <g ref={groupRef}>
          <path
            ref={pathRef}
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.1"
            strokeWidth={config.strokeWidth}
          />
          {Array.from({ length: config.particleCount }).map((_, i) => (
            <circle
              key={i}
              ref={(el) => {
                particlesRef.current[i] = el;
              }}
              fill="currentColor"
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
