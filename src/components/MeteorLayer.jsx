import React, { useEffect, useRef, useState } from 'react';

// 夜空里偶尔划过的流星，从右上方向左下方掠过，尾迹严格拖在身后
export default function MeteorLayer({ enabled = true }) {
  const [meteors, setMeteors] = useState([]);
  const seq = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setMeteors([]);
      return;
    }
    let timer;
    const spawn = () => {
      const id = seq.current++;
      // 位移向量决定飞行方向，尾迹角度由它反推，两者始终一致
      const mx = 520 + Math.random() * 150;
      const my = mx * (0.5 + Math.random() * 0.2);
      const angle = (-Math.atan2(my, mx) * 180) / Math.PI;

      setMeteors((list) => [
        ...list,
        {
          id,
          top: 2 + Math.random() * 58,
          left: 44 + Math.random() * 52,
          duration: 1.5 + Math.random() * 0.9,
          length: 90 + Math.random() * 90,
          mx,
          my,
          angle
        }
      ]);
      timer = setTimeout(spawn, 4200 + Math.random() * 6500);
    };
    timer = setTimeout(spawn, 1800);
    return () => clearTimeout(timer);
  }, [enabled]);

  const remove = (id) => setMeteors((list) => list.filter((m) => m.id !== id));

  return (
    <div className="meteor-layer">
      {meteors.map((m) => (
        <div
          key={m.id}
          className="meteor"
          style={{
            top: `${m.top}%`,
            left: `${m.left}%`,
            animationDuration: `${m.duration}s`,
            '--mx': `${m.mx}px`,
            '--my': `${m.my}px`
          }}
          onAnimationEnd={() => remove(m.id)}
        >
          <span
            className="meteor-tail"
            style={{ width: `${m.length}px`, transform: `rotate(${m.angle.toFixed(2)}deg)` }}
          />
        </div>
      ))}
    </div>
  );
}
