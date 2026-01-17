import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../components/UI';

const AboutPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-full p-4 pb-8 pt-20 transition-colors max-w-4xl mx-auto w-full">
      
      {/* Sticky Header */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-gray-200/50 dark:border-slate-700/50 shadow-sm flex items-center gap-4 px-4 py-3 transition-colors duration-300">
          <button onClick={() => navigate('/')} className="text-gray-700 dark:text-gray-300 hover:text-somali-blue dark:hover:text-blue-400 transition-colors">
            <i className="fas fa-arrow-left fa-lg"></i>
          </button>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">About Us</h1>
      </div>

      <div className="space-y-6">
        
        {/* Intro */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-extrabold text-somali-blue dark:text-blue-400 mb-2">LP-F4</h1>
          <p className="text-gray-700 dark:text-gray-300 font-bold text-lg">Empowering Somali Students Through Knowledge</p>
        </div>

        {/* Stats Cards - Removed scroll animations for stability */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="text-center border-b-4 border-blue-500 transform transition-transform hover:-translate-y-1">
                <i className="fas fa-users text-3xl text-blue-500 mb-2"></i>
                <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white">1,200+</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Active Learners</p>
            </Card>
            <Card className="text-center border-b-4 border-green-500 transform transition-transform hover:-translate-y-1">
                <i className="fas fa-layer-group text-3xl text-green-500 mb-2"></i>
                <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white">500+</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Total Quizzes</p>
            </Card>
            <Card className="text-center border-b-4 border-yellow-500 transform transition-transform hover:-translate-y-1">
                <i className="fas fa-headset text-3xl text-yellow-500 mb-2"></i>
                <h3 className="text-3xl font-extrabold text-gray-900 dark:text-white">24/7</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Student Support</p>
            </Card>
        </div>

        {/* Mission & Vision */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="h-full">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-somali-blue dark:text-blue-300">
                        <i className="fas fa-rocket"></i>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Our Mission</h2>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                    To gamify education and make learning accessible, engaging, and competitive for every Somali student.
                </p>
            </Card>

            <Card className="h-full">
                <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center text-purple-600 dark:text-purple-300">
                        <i className="fas fa-eye"></i>
                    </div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-white">Our Vision</h2>
                </div>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                    A future where every student in the Horn of Africa has access to world-class educational tools that foster curiosity, critical thinking, and academic excellence.
                </p>
            </Card>
        </div>

        {/* Our Story */}
        <Card>
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white border-l-4 border-somali-blue pl-3">Our Story</h2>
            <p className="text-gray-700 dark:text-gray-300 mb-4 leading-relaxed font-medium">
                LP-F4 started as a small project to help students prepare for exams using simple flashcards. We realized that students learn best when they are challenged and having fun. 
            </p>
            <p className="text-gray-700 dark:text-gray-300 leading-relaxed font-medium">
                Today, we have evolved into a real-time multiplayer battle platform where knowledge meets competition. We believe that by connecting students, we create a community of lifelong learners.
            </p>
        </Card>

        {/* Contact Info */}
        <Card>
            <h2 className="text-xl font-bold mb-6 flex items-center gap-2 text-gray-900 dark:text-white"><i className="fas fa-paper-plane text-somali-blue"></i> Get in Touch</h2>
            <div className="space-y-4">
                <div className="flex items-center gap-4 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0">
                        <i className="fas fa-envelope"></i>
                    </div>
                    <div className="overflow-hidden">
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold">Email</p>
                        <p className="font-bold text-gray-900 dark:text-white truncate">libaanpro5@gmail.com</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0">
                        <i className="fas fa-phone"></i>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold">Phone</p>
                        <p className="font-bold text-gray-900 dark:text-white">+252 61 398 2172</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 font-bold mt-0.5">or +1 (250) 288-0729</p>
                    </div>
                </div>
                <div className="flex items-center gap-4 bg-gray-100 dark:bg-gray-800 p-3 rounded-xl transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 flex items-center justify-center shrink-0">
                        <i className="fas fa-map-marker-alt"></i>
                    </div>
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest font-bold">Location</p>
                        <p className="font-bold text-gray-900 dark:text-white">Mogadishu, Somalia</p>
                    </div>
                </div>
            </div>
        </Card>
        
        <div className="text-center text-gray-500 dark:text-gray-400 text-sm py-6 font-medium">
            &copy; 2024 LP-F4 Educational Platform. All rights reserved.
        </div>
      </div>
    </div>
  );
};

export default AboutPage;
