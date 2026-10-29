import Showcase3D, { type Which } from './Showcase3D';

/** Chromeless page used to render the PNG illustrations: #showcase-all, #showcase-car, ... */
export default function ShowcasePage({ which }: { which: Which }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(120% 90% at 50% 20%, #f4faf6 0%, #dcefe4 60%, #cfe6da 100%)' }}>
      <Showcase3D only={which} still />
    </div>
  );
}
