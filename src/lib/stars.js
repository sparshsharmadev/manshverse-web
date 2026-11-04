export const STARS = Array.from({length: 24}).map((_, i) => ({
  id: i, 
  left: `${Math.random() * 100}%`, 
  top: `${Math.random() * 100}%`,
  w: `${Math.random() * 1.5 + 0.5}px`, 
  dur: `${Math.random() * 4 + 2}s`,
  delay: `${Math.random() * 5}s`, 
  op: Math.random() * 0.6 + 0.1,
}));
