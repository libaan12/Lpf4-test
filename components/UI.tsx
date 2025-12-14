import React from 'react';

// --- Button ---
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'outline';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, variant = 'primary', fullWidth, isLoading, className = '', ...props 
}) => {
  const baseStyle = "py-3 px-6 rounded-xl font-bold transition-all duration-200 active:scale-95 shadow-sm hover:shadow-md flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100";
  
  const variants = {
    // Primary: Blue in both modes
    primary: "bg-somali-blue text-white hover:bg-blue-600 shadow-blue-500/20",
    // Secondary: Yellow/Dark-Yellow
    secondary: "bg-yellow-400 text-yellow-950 hover:bg-yellow-500 dark:bg-yellow-500 dark:text-black dark:hover:bg-yellow-400",
    // Danger: Red
    danger: "bg-red-500 text-white hover:bg-red-600 dark:bg-red-600 dark:hover:bg-red-500 shadow-red-500/20",
    // Outline: Bordered
    outline: "border-2 border-somali-blue text-somali-blue hover:bg-blue-50 dark:border-blue-500 dark:text-blue-400 dark:hover:bg-gray-800"
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
  <div className="mb-4">
    {label && <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2 transition-colors">{label}</label>}
    <div className="relative group">
      {icon && (
        <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-gray-400 dark:text-gray-500 group-focus-within:text-somali-blue dark:group-focus-within:text-blue-400 transition-colors">
          <i className={`fas ${icon}`}></i>
        </span>
      )}
      <input 
        className={`w-full bg-white dark:bg-gray-900 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 rounded-xl py-3 ${icon ? 'pl-12' : 'pl-4'} ${rightElement ? 'pr-12' : 'pr-4'} focus:outline-none focus:ring-2 focus:ring-somali-blue dark:focus:ring-blue-500 focus:border-transparent transition-all placeholder-gray-400 dark:placeholder-gray-600 ${className}`}
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
  // Enforce text-gray-900 for light mode and text-white for dark mode to ensure visibility
  <div className={`bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700/50 p-6 transition-all ${className}`}>
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
}> = ({ src, seed, size = 'md', className = '', pulse = false }) => {
  const sizes = {
    sm: "w-10 h-10",
    md: "w-16 h-16",
    lg: "w-24 h-24",
    xl: "w-32 h-32"
  };

  const imageUrl = src || `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed || 'guest'}`;

  return (
    <div className={`relative rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden ${sizes[size]} ${className} ${pulse ? 'animate-pulse ring-4 ring-red-400' : ''}`}>
      <img src={imageUrl} alt="Avatar" className="w-full h-full object-cover" />
    </div>
  );
};

// --- Modal ---
export const Modal: React.FC<{ isOpen: boolean; title?: string; children: React.ReactNode }> = ({ isOpen, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate__animated animate__fadeIn">
      <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl border border-gray-100 dark:border-gray-700 animate__animated animate__zoomIn">
        {title && (
            <div className="bg-gray-50 dark:bg-gray-900/50 p-4 border-b border-gray-100 dark:border-gray-700 text-center font-bold text-lg">
                {title}
            </div>
        )}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};