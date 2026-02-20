
import React, { useState } from 'react';

// --- Base Styles ---
const CARD_BASE = "bg-white dark:bg-slate-200 rounded-3xl border-2 border-slate-200 dark:border-slate-300 shadow-xl transition-all";
const INPUT_BASE = "bg-slate-100 dark:bg-slate-100 border-2 border-slate-300 dark:border-slate-600 rounded-xl focus:border-game-primary dark:focus:border-game-primary focus:ring-4 focus:ring-game-primary/20 transition-all font-bold";

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'glass' | 'ghost';
  fullWidth?: boolean;
  isLoading?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', fullWidth, isLoading, size = 'md', className = '', ...props 
}) => {
  const sizeClasses = {
    sm: "py-2 px-4 text-xs",
    md: "py-3 px-6 text-sm",
    lg: "py-4 px-8 text-base md:text-lg"
  };

  const baseStyle = `btn-3d relative font-black uppercase tracking-wider rounded-2xl flex items-center justify-center gap-2 overflow-hidden ${sizeClasses[size]} ${fullWidth ? 'w-full' : ''}`;
  
  const variants = {
    // Primary: Indigo/Game Primary
    primary: "bg-game-primary text-white border-b-4 border-game-primaryDark hover:brightness-110",
    // Secondary: Amber/Gold
    secondary: "bg-game-accent text-white border-b-4 border-game-accentDark hover:brightness-110",
    // Danger: Red
    danger: "bg-game-danger text-white border-b-4 border-game-dangerDark hover:brightness-110",
    // Outline: Transparent with border
    outline: "bg-transparent border-2 border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-200 shadow-none transform-none active:translate-y-0",
    // Glass: Semi-transparent
    glass: "bg-white/20 backdrop-blur-md border border-white/40 text-white shadow-lg",
    // Ghost: No background
    ghost: "bg-transparent text-slate-500 hover:text-game-primary shadow-none box-shadow-none"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${className}`}
      {...props}
    >
      {isLoading && <i className="fas fa-spinner fa-spin animate-spin"></i>}
      {children}
    </button>
  );
};

// --- Input ---
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: string;
  rightElement?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, icon, rightElement, className = '', type, ...props }) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const effectiveType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className="mb-4">
      {label && <label className="block text-slate-600 dark:text-slate-600 text-xs font-black uppercase tracking-widest mb-2 ml-1">{label}</label>}
      <div className="relative group">
        {icon && (
          <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500 group-focus-within:text-game-primary transition-colors z-10">
            <i className={`fas ${icon} text-lg`}></i>
          </span>
        )}
        <input 
          className={`w-full ${INPUT_BASE} py-4 ${icon ? 'pl-12' : 'pl-4'} ${rightElement || isPassword ? 'pr-12' : 'pr-4'} text-slate-900 dark:text-white placeholder-slate-400 outline-none ${className}`}
          type={effectiveType}
          {...props}
        />
        {isPassword ? (
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500 hover:text-game-primary transition-colors z-10 focus:outline-none"
              tabIndex={-1}
            >
              <i className={`fas ${showPassword ? 'fa-eye-slash' : 'fa-eye'} text-lg`}></i>
            </button>
        ) : (
            rightElement && (
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 z-10">
                {rightElement}
                </div>
            )
        )}
      </div>
    </div>
  );
};

// --- Verification Badge ---
export const VerificationBadge: React.FC<{ className?: string, size?: 'xs'|'sm'|'md'|'lg'|'xl', src?: string }> = ({ className = '', size = 'md', src }) => {
  const sizeClasses = {
    xs: "w-4 h-4",
    sm: "w-5 h-5",
    md: "w-6 h-6",
    lg: "w-8 h-8",
    xl: "w-10 h-10"
  };
  
  const iconSrc = src || "https://cdn-icons-png.flaticon.com/512/12559/12559876.png";

  return (
    <div className={`inline-block select-none ${sizeClasses[size]} ${className}`} title="Badge">
        <img 
            src={iconSrc} 
            alt="Badge" 
            className="w-full h-full object-contain"
        />
    </div>
  );
};

// --- Card ---
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`${CARD_BASE} p-6 ${className}`}>
    {children}
  </div>
);

// --- Avatar ---
export const Avatar: React.FC<{ 
  src?: string; 
  seed?: string; 
  size?: 'sm' | 'md' | 'lg' | 'xl'; 
  className?: string; 
  pulse?: boolean; 
  onClick?: () => void;
  border?: string;
  isVerified?: boolean;
  isSupport?: boolean;
  isOnline?: boolean;
}> = ({ src, seed, size = 'md', className = '', pulse = false, onClick, border, isVerified, isSupport, isOnline }) => {
  const sizes = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-32 h-32"
  };

  const safeSeed = seed || 'guest';
  const imageUrl = src || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(safeSeed)}&mouth=default&eyes=default&eyebrows=default&facialHairProbability=0`;

  return (
    <div className="relative inline-block" onClick={onClick}>
        <div 
          className={`relative rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden ${sizes[size]} ${className} ${pulse ? 'animate-pulse ring-4 ring-game-danger' : ''} shadow-lg`}
          style={{ border: border || '3px solid white' }}
        >
          <img src={imageUrl} alt="Avatar" className="w-full h-full object-cover" />
        </div>
        
        {/* Online Status Overlay */}
        {isOnline && (
             <span className="absolute bottom-0.5 right-0.5 block h-3.5 w-3.5 rounded-full ring-2 ring-white dark:ring-slate-800 bg-green-500 z-10">
                 <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-75"></span>
             </span>
        )}
    </div>
  );
};

// --- Modal ---
export const Modal: React.FC<{ isOpen: boolean; title?: string; children: React.ReactNode; onClose?: () => void }> = ({ isOpen, title, children, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate__animated animate__fadeIn">
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative w-full max-w-md bg-white dark:bg-slate-200 rounded-[2rem] shadow-2xl animate__animated animate__zoomIn border-4 border-white dark:border-slate-300 overflow-hidden flex flex-col max-h-[90vh]`}>
        {title && (
            <div className="bg-slate-50 dark:bg-slate-100/50 p-5 border-b-2 border-slate-100 dark:border-slate-300 flex justify-between items-center">
                <span className="font-black text-xl text-slate-800 dark:text-white uppercase tracking-tight">{title}</span>
                {onClose && (
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center text-slate-500 dark:text-slate-500">
                        <i className="fas fa-times"></i>
                    </button>
                )}
            </div>
        )}
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};
