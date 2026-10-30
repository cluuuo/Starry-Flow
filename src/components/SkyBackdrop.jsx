import React, { useMemo } from 'react';
import { seededRandom } from '../lib/logic';

// 生成一层随机星点：位置、大小、亮度、闪烁节奏都随机
function makeStars(count, kind) {
  const rnd = seededRandom('sky-' + kind);
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      left: rnd() * 50,           // 只在左半区铺，右半区自动复制一份，保证循环无缝
      top: rnd() * 100,
      size: kind === 'near' ? 1.4 + rnd() * 1.2 : 0.8 + rnd() * 0.9,
      opacity: kind === 'near' ? 0.45 + rnd() * 0.5 : 0.2 + rnd() * 0.4,
      twinkle: 3 + rnd() * 5,
      delay: rnd() * 6
    });
  }
  return stars;
}

function StarLayer({ stars, className }) {
  return (
    <>
      {stars.map((s, i) => (
        <span
          key={i}
          className="sky-star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: s.opacity,
            animationDuration: `${s.twinkle}s`,
            animationDelay: `${s.delay}s`
          }}
        />
      ))}
      {stars.map((s, i) => (
        <span
          key={`c${i}`}
          className="sky-star"
          style={{
            left: `${s.left + 50}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: s.opacity,
            animationDuration: `${s.twinkle}s`,
            animationDelay: `${s.delay}s`
          }}
        />
      ))}
    </>
  );
}

// 夜空背景：两层随机星野，向左循环流动，速度差形成视差
export default function SkyBackdrop({ density, duration, animated = true }) {
  const farStars = useMemo(() => makeStars(Math.round(70 * density), 'far'), [density]);
  const nearStars = useMemo(() => makeStars(Math.round(26 * density), 'near'), [density]);

  return (
    <div className={`sky-backdrop${animated ? '' : ' is-static'}`}>
      <div className="sky-layer" style={{ animationDuration: `${(duration * 3).toFixed(1)}s` }}>
        <StarLayer stars={farStars} />
      </div>
      <div
        className="sky-layer sky-layer-near"
        style={{ animationDuration: `${duration.toFixed(1)}s` }}
      >
        <StarLayer stars={nearStars} />
      </div>
    </div>
  );
}
