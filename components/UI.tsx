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
  const baseStyle = "py-3 px-6 rounded-xl font-bold transition-all duration-200 active:scale-95 shadow-md flex justify-center items-center gap-2";
  const variants = {
    primary: "bg-somali-blue text-white hover:bg-blue-600 dark:hover:bg-blue-500",
    secondary: "bg-yellow-400 text-black hover:bg-yellow-500 dark:bg-yellow-500",
    danger: "bg-red-500 text-white hover:bg-red-600 dark:bg-red-600",
    outline: "border-2 border-somali-blue text-somali-blue hover:bg-blue-50 dark:border-blue-400 dark:text-blue-400 dark:hover:bg-gray-800"
  };

  return (
    <button 
      className={`${baseStyle} ${variants[variant]} ${fullWidth ? 'w-full' : ''} ${className} ${props.disabled || isLoading ? 'opacity-50 cursor-not-allowed active:scale-100' : ''}`}
      {...props}
    >
      {isLoading && <i className="fas fa-spinner fa-spin"></i>}
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
    {label && <label className="block text-gray-700 dark:text-gray-300 text-sm font-bold mb-2">{label}</label>}
    <div className="relative">
      {icon && (
        <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500">
          <i className={`fas ${icon}`}></i>
        </span>
      )}
      <input 
        className={`w-full bg-white dark:bg-gray-800 text-gray-800 dark:text-white border-2 border-gray-200 dark:border-gray-700 rounded-xl py-3 ${icon ? 'pl-10' : 'pl-4'} ${rightElement ? 'pr-12' : 'pr-4'} focus:outline-none focus:border-somali-blue dark:focus:border-blue-500 transition-colors ${className}`}
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
  <div className={`bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-2xl shadow-lg p-6 transition-colors ${className}`}>
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

  // Prioritize src (saved URL), fallback to seed generation, default to guest
  const imageUrl = src || `https://api.dicebear.com/7.x/avataaars/svg?seed=${seed || 'guest'}`;

  return (
    <div className={`relative rounded-full bg-gray-100 dark:bg-gray-700 border-4 border-white dark:border-gray-600 shadow-sm overflow-hidden ${sizes[size]} ${className} ${pulse ? 'animate-pulse ring-4 ring-red-400' : ''}`}>
      <img src={imageUrl} alt="Avatar" className="w-full h-full object-cover" />
    </div>
  );
};

// --- Modal ---
export const Modal: React.FC<{ isOpen: boolean; title?: string; children: React.ReactNode }> = ({ isOpen, title, children }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-60 backdrop-blur-sm animate__animated animate__fadeIn">
      <div className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl animate__animated animate__zoomIn">
        {title && <div className="bg-gray-50 dark:bg-gray-700 p-4 border-b dark:border-gray-600 text-center font-bold text-lg">{title}</div>}
        <div className="p-6">
          {children}
        </div>
      </div>
    </div>
  );
};