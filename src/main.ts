import { mount } from 'svelte'
import App from './App.svelte'
import './app.css'

mount(App, { target: document.getElementById('app')! })

// Offline: the app keeps a copy of itself (public/sw.js). Only in a real build; dev serves fresh files.
if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {})
