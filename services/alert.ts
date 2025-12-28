import Swal, { SweetAlertIcon, SweetAlertPosition, SweetAlertOptions } from 'sweetalert2';

// Helper to get custom icon HTML matching the Battle HQ aesthetic
const getIconHtml = (icon?: SweetAlertIcon) => {
  switch (icon) {
    case 'success': 
      return '<div class="animate__animated animate__zoomIn"><i class="fas fa-check-circle text-4xl text-green-500 drop-shadow-[0_0_10px_rgba(34,197,94,0.4)]"></i></div>';
    case 'error': 
      return '<div class="animate__animated animate__shakeX"><i class="fas fa-times-circle text-4xl text-red-500 drop-shadow-[0_0_10px_rgba(239,68,68,0.4)]"></i></div>';
    case 'warning': 
      return '<div class="animate__animated animate__swing"><i class="fas fa-exclamation-triangle text-4xl text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.4)]"></i></div>';
    case 'info': 
      return '<div class="animate__animated animate__fadeIn"><i class="fas fa-info-circle text-4xl text-somali-blue drop-shadow-[0_0_10px_rgba(59,130,246,0.4)]"></i></div>';
    case 'question': 
      return '<div class="animate__animated animate__bounceIn"><i class="fas fa-question-circle text-4xl text-purple-500 drop-shadow-[0_0_10px_rgba(168,85,247,0.4)]"></i></div>';
    default: 
      return undefined;
  }
};

// Base configuration for all alerts
const glassConfig: SweetAlertOptions = {
  background: 'transparent',
  color: 'inherit',
  buttonsStyling: false,
  showCloseButton: true, // ADDED: Close button (X icon)
  customClass: {
    popup: 'glass-swal-popup',
    title: 'glass-swal-title',
    htmlContainer: 'glass-swal-content',
    confirmButton: 'glass-swal-btn-confirm',
    cancelButton: 'glass-swal-btn-cancel',
    denyButton: 'glass-swal-btn-deny',
    input: 'glass-swal-input',
    icon: 'glass-swal-icon-custom' 
  },
  backdrop: `
    rgba(0,0,0,0.4)
    backdrop-filter: blur(8px)
    -webkit-backdrop-filter: blur(8px)
  `
};

export const showAlert = (title: string, text: string, icon: SweetAlertIcon = 'info') => {
  return Swal.fire({
    ...glassConfig,
    title,
    text,
    iconHtml: getIconHtml(icon),
  });
};

export const showToast = (title: string, icon: SweetAlertIcon = 'success', position: SweetAlertPosition = 'top') => {
  // For toasts, we use a smaller icon size
  const getToastIconHtml = (icon?: SweetAlertIcon) => {
    switch (icon) {
        case 'success': return '<i class="fas fa-check-circle text-xl text-green-500"></i>';
        case 'error': return '<i class="fas fa-times-circle text-xl text-red-500"></i>';
        case 'warning': return '<i class="fas fa-exclamation-triangle text-xl text-yellow-400"></i>';
        default: return '<i class="fas fa-info-circle text-xl text-somali-blue"></i>';
    }
  };

  return Swal.fire({
    ...glassConfig,
    title,
    position,
    toast: true,
    showCloseButton: false, // Toast usually doesn't need X
    iconHtml: getToastIconHtml(icon),
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    customClass: {
      popup: 'glass-swal-toast',
      title: 'glass-swal-toast-title',
      timerProgressBar: 'glass-swal-timer',
      icon: 'glass-swal-icon-toast'
    },
    backdrop: false
  });
};

export const showConfirm = async (
  title: string, 
  text: string, 
  confirmText: string = 'Yes',
  cancelText: string = 'Cancel',
  icon: SweetAlertIcon = 'warning'
): Promise<boolean> => {
  const result = await Swal.fire({
    ...glassConfig,
    title,
    text,
    iconHtml: getIconHtml(icon),
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
  });
  return result.isConfirmed;
};

export const showPrompt = async (title: string, placeholder: string): Promise<string | null> => {
  const result = await Swal.fire({
    ...glassConfig,
    title,
    iconHtml: getIconHtml('question'),
    input: 'text',
    inputPlaceholder: placeholder,
    showCancelButton: true,
  });
  
  if (result.isConfirmed && result.value) {
      return result.value;
  }
  return null;
};