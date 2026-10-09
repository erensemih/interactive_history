import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import '@fontsource-variable/instrument-sans/wght.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/layout.css';
import './styles/map.css';
import './styles/panel.css';
import './styles/dock.css';
import { startApp } from './app';

startApp(document.getElementById('app')!).catch((err) => {
  console.error(err);
});
