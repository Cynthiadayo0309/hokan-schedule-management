import { it,expect } from 'vitest';
import config from '../src-tauri/tauri.conf.json';
it('WindowsのHTML5ドラッグを妨げるネイティブファイルドロップを無効にする',()=>{expect(config.app.windows.every(window=>window.dragDropEnabled===false)).toBe(true);});
