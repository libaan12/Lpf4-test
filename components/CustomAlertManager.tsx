
import React, { useState, useEffect } from 'react';
import { alertBus, AlertOptions } from '../services/alert';
import { Button, Input } from './UI';
import { playSound } from '../services/audioService';

export const CustomAlertManager: React.FC = () => {
  const [alerts, setAlerts] = useState<AlertOptions[]>([]);
  const [toasts, setToasts] = useState<AlertOptions[]>([]);
  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const handleNewAlert = (e: any) => {
      const options = e.detail as AlertOptions;
      if (options.type === 'toast') {
        setToasts(prev => [...prev, options]);
        if (options.timer) {
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== options.id));
          }, options.timer);
        }
      } else {
        setAlerts(prev => [...prev, options]);
        setInputValue('');
        if (options.type === 'confirm' || options.type === 'prompt') {
            playSound('turn');
        } else {
            playSound('message');
        }
      }
    };

    alertBus.addEventListener('new-alert', handleNewAlert);
    return () => alertBus.removeEventListener('new-alert', handleNewAlert);
  }, []);

  const closeAlert = (id: string, confirmed: boolean = false) => {
    const alert = alerts.find(a => a.id === id);
    if (!alert) return;

    if (confirmed) {
      alert.onConfirm?.(inputValue);
    } else {
      alert.onCancel?.();
    }

    setAlerts(prev => prev.filter(a => a.id !== id));
    playSound('click');
  };

  const getIcon = (icon?: string) => {
    switch (icon) {
      case 'success': return <i className="fas fa-check-circle text-green-500"></i>;
      case 'error': return <i className="fas fa-times-circle text-red-500"></i>;
      case 'warning': return <i className="fas fa-exclamation-triangle text-yellow-400"></i>;
      case 'info': return <i className="fas fa-info-circle text-blue-400"></i>;
      case 'question': return <i className="fas fa-question-circle text-purple-500"></i>;
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none select-none">
      {/* Toasts Container */}
      <div className="absolute top-4 left-0 right-0 flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map(toast => (
          <div 
            key={toast.id}
            className="pointer-events-auto bg-slate-100/90 backdrop-blur-xl border border-white/10 px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate__animated animate__slideInDown"
          >
            <span className="text-lg">{getIcon(toast.icon)}</span>
            <span className="text-white font-black text-xs uppercase tracking-widest">{toast.title}</span>
          </div>
        ))}
      </div>

      {/* Modals Container */}
      {alerts.length > 0 && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm pointer-events-auto flex items-center justify-center p-4 animate__animated animate__fadeIn">
          {alerts.map((alert, index) => (
            <div 
              key={alert.id}
              className={`w-full max-w-sm bg-slate-50 border-2 border-white/10 p-8 rounded-[2.5rem] shadow-2xl animate__animated animate__zoomIn flex flex-col items-center text-center ${index === alerts.length - 1 ? 'block' : 'hidden'}`}
            >
              <div className="text-5xl mb-6 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                {getIcon(alert.icon)}
              </div>
              <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-2 leading-tight">
                {alert.title}
              </h2>
              {alert.text && (
                <p className="text-slate-400 font-bold text-sm mb-8 leading-relaxed">
                  {alert.text}
                </p>
              )}

              {alert.type === 'prompt' && (
                <div className="w-full mb-6">
                  <Input 
                    autoFocus
                    placeholder={alert.placeholder || 'Enter value...'}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    className="!bg-slate-200 !border-slate-700 !text-center !text-white"
                  />
                </div>
              )}

              <div className="flex gap-3 w-full">
                {alert.type === 'confirm' || alert.type === 'prompt' ? (
                  <>
                    <Button 
                      variant="outline" 
                      fullWidth 
                      onClick={() => closeAlert(alert.id, false)}
                      className="!border-slate-700 !text-slate-500 !rounded-2xl"
                    >
                      {alert.cancelText || 'Cancel'}
                    </Button>
                    <Button 
                      fullWidth 
                      onClick={() => closeAlert(alert.id, true)}
                      className="!rounded-2xl shadow-xl shadow-game-primary/20"
                    >
                      {alert.confirmText || 'Confirm'}
                    </Button>
                  </>
                ) : (
                  <Button 
                    fullWidth 
                    onClick={() => closeAlert(alert.id, true)}
                    className="!rounded-2xl shadow-xl shadow-game-primary/20"
                  >
                    OK
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
