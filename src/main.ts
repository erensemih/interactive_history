import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/instrument-sans/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/map.css';
import './styles/panel.css';
import './styles/dock.css';
import './styles/chat.css';
import './styles/ai.css';
import { startApp } from './app';

// Turkish casing (dotted İ, dotless ı) in CSS `text-transform` follows the document language, also when a
// host page supplies its own <html>.
document.documentElement.lang = 'tr';

startApp(document.getElementById('app')!).catch((err) => {
  console.error(err);
});
