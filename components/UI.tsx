import React from 'react';

// --- Glassmorphism Base Classes ---
const GLASS_CARD_LIGHT = "bg-white/70 backdrop-blur-xl border border-white/50 shadow-xl";
const GLASS_CARD_DARK = "dark:bg-gray-900/70 dark:backdrop-blur-xl dark:border-white/10";
const GLASS_INPUT_LIGHT = "bg-white/50 backdrop-blur-sm border border-white/30 focus:bg-white/80";
const GLASS_INPUT_DARK = "dark:bg-black/30 dark:border-white/10 dark:focus:bg-black/50";

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline' | 'glass';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', fullWidth, isLoading, className = '', ...props 
}) => {
  const baseStyle = "py-3.5 px-6 rounded-2xl font-bold transition-all duration-300 active:scale-95 flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed tracking-wide shadow-lg hover:shadow-xl";
  
  const variants = {
    // Primary: Vibrant gradient blue
    primary: "bg-gradient-to-r from-somali-blue to-blue-600 text-white hover:brightness-110 shadow-blue-500/30 border border-white/20",
    // Secondary: Glassy yellow/gold
    secondary: "bg-gradient-to-r from-yellow-400 to-amber-500 text-white hover:brightness-110 shadow-yellow-500/30 border border-white/20",
    // Danger: Glassy red
    danger: "bg-gradient-to-r from-red-500 to-rose-600 text-white hover:brightness-110 shadow-red-500/30 border border-white/20",
    // Outline: Glass border
    outline: "bg-transparent border-2 border-somali-blue text-somali-blue hover:bg-somali-blue/10 dark:border-blue-400 dark:text-blue-400",
    // Glass: Pure glass button
    glass: "bg-white/20 hover:bg-white/30 text-gray-800 dark:text-white border border-white/30 backdrop-blur-md"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className}`}
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

export const Input: React.FC<InputProps> = ({ label, icon, rightElement, className = '', ...props }) => (
  <div className="mb-5">
    {label && <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2 ml-1 transition-colors">{label}</label>}
    <div className="relative group">
      {icon && (
        <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-500 dark:text-gray-400 group-focus-within:text-somali-blue dark:group-focus-within:text-blue-400 transition-colors">
          <i className={`fas ${icon}`}></i>
        </span>
      )}
      <input 
        className={`w-full ${GLASS_INPUT_LIGHT} ${GLASS_INPUT_DARK} text-gray-900 dark:text-white rounded-2xl py-4 ${icon ? 'pl-12' : 'pl-4'} ${rightElement ? 'pr-12' : 'pr-4'} focus:outline-none focus:ring-2 focus:ring-somali-blue/50 dark:focus:ring-blue-500/50 transition-all placeholder-gray-500 dark:placeholder-gray-500 font-medium ${className}`}
        {...props}
      />
      {rightElement && (
        <div className="absolute inset-y-0 right-0 flex items-center pr-3">
          {rightElement}
        </div>
      )}
    </div>
  </div>
);

// --- Card ---
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`${GLASS_CARD_LIGHT} ${GLASS_CARD_DARK} rounded-3xl p-6 transition-all duration-300 ${className}`}>
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
}> = ({ src, seed, size = 'md', className = '', pulse = false, onClick }) => {
  const sizes = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-32 h-32"
  };

  const safeSeed = seed || 'guest';
  const imageUrl = src || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(safeSeed)}&mouth=default&eyes=default&eyebrows=default&facialHairProbability=0`;

  return (
    <div 
      onClick={onClick}
      className={`relative rounded-full bg-white/50 dark:bg-gray-700/50 backdrop-blur-sm border border-white/50 dark:border-white/10 overflow-hidden shadow-inner ${sizes[size]} ${className} ${pulse ? 'animate-pulse ring-4 ring-red-400' : ''}`}
    >
      <img src={imageUrl} alt="Avatar" className="w-full h-full object-cover" />
    </div>
  );
};

// --- Modal ---
export const Modal: React.FC<{ isOpen: boolean; title?: string; children: React.ReactNode; onClose?: () => void }> = ({ isOpen, title, children, onClose }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/30 dark:bg-black/60 backdrop-blur-md animate__animated animate__fadeIn">
      {/* Click outside to close */}
      <div className="absolute inset-0" onClick={onClose}></div>
      
      <div className={`relative w-full max-w-sm overflow-hidden flex flex-col animate__animated animate__zoomIn max-h-[90vh] ${GLASS_CARD_LIGHT} ${GLASS_CARD_DARK} rounded-3xl`}>
        {title && (
            <div className="bg-white/30 dark:bg-black/20 p-5 border-b border-white/20 dark:border-white/10 text-center font-extrabold text-xl flex justify-between items-center text-gray-800 dark:text-white backdrop-blur-md">
                <span>{title}</span>
                {onClose && (
                    <button onClick={onClose} className="w-8 h-8 rounded-full bg-black/5 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center">
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