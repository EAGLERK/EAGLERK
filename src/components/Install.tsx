import { isIOS, isNative, isStandalone } from '../platform';
import { useInstallPrompt } from '../pwa';
import { Card } from './ui';
import { Icon } from './icons';
import { useToast } from './feedback';

/** Settings card: put MyMoney on the home screen. Hidden once it is installed, and inside the Android and iOS apps. */
export function InstallCard() {
  const { canPrompt, prompt } = useInstallPrompt();
  const { toast } = useToast();
  if (isNative() || isStandalone()) return null;
  const ios = isIOS();
  return (
    <Card title="Use MyMoney as an app" sub="Add it to your home screen to open it full screen, like any other app. It keeps working without a connection.">
      <div className="stack">
        {canPrompt ? (
          <div className="row">
            <button className="btn" onClick={() => void prompt().then((r) => { if (r === 'accepted') toast('MyMoney is installed'); })}><Icon name="plus" size={16} />Install the app</button>
          </div>
        ) : ios ? (
          <p className="sub">In Safari, tap the Share button, then <b>Add to Home Screen</b>.</p>
        ) : (
          <p className="sub">Open your browser&rsquo;s menu and choose <b>Install app</b> or <b>Add to Home screen</b>. If you do not see it, this browser may not support installing.</p>
        )}
        {ios && <p className="field-note">On iPhone and iPad the home-screen app keeps its own storage, separate from Safari. Download a backup here first, then restore it inside the app, or your data will look missing.</p>}
      </div>
    </Card>
  );
}
