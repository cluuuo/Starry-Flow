import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import MiniApp from './components/MiniApp';
import './styles.css';

// 迷你窗口通过 ?mode=mini 载入同一个页面，只渲染极简的星点视图
const isMini = new URLSearchParams(window.location.search).get('mode') === 'mini';

createRoot(document.getElementById('root')).render(isMini ? <MiniApp /> : <App />);
