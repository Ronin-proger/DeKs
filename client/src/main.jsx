import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ToastProvider } from './context/ToastContext';
import { ConfirmProvider } from './context/ConfirmContext';
import { LanguageProvider } from './context/LanguageContext';
import App from './App';
import './styles/tokens.css';
import './styles/primitives.css';
import './styles/responsive.css';
import './App.css';

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter future={{ v7_relativeSplatPath: true }}>
            <LanguageProvider>
                <ToastProvider>
                    <ConfirmProvider>
                        <App />
                    </ConfirmProvider>
                </ToastProvider>
            </LanguageProvider>
        </BrowserRouter>
    </React.StrictMode>
);
