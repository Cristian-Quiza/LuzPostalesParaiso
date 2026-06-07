import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Zap, AlertTriangle, Eye, EyeOff, Building2, Sun, Moon } from 'lucide-react';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error, clearError } = useAuthStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [adminMode, setAdminMode] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.75;
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await login(username, password);
      const loggedUser = useAuthStore.getState().usuario;
      navigate(loggedUser?.rol === 'cliente' ? '/cliente' : '/dashboard');
    } catch {
      // Error handled by store
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Video Background */}
      <div className="absolute inset-0 z-0">
        <video
          ref={videoRef}
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover"
          poster="https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=1920&q=80"
        >
          <source 
            src="https://assets.mixkit.co/videos/preview/mixkit-city-at-night-with-traffic-and-people-walking-1095-large.mp4" 
            type="video/mp4" 
          />
        </video>
        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/25 to-black/10" />
        <div className="absolute inset-0 bg-primary/5" />
      </div>

      {/* Glassmorphic Header */}
      <header className="relative z-50">
        <div className="glass-header">
          <div className="container mx-auto px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-yellow-400 to-green-500 flex items-center justify-center shadow-lg">
                    <Sun className="h-6 w-6 text-white" />
                  </div>
                  <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-green-400 border-2 border-white animate-pulse" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">Portales del Paraíso</h1>
                  <p className="text-xs text-white/60">Sistema de Facturación</p>
                </div>
              </div>
              <div className="flex items-center gap-3 md:gap-4">
                <Button type="button" variant="outline" onClick={() => { setAdminMode((value) => !value); clearError(); }} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
                  {adminMode ? 'Ingreso propietario' : 'Ingreso administrador'}
                </Button>
                <span className="text-white/80 text-sm">Energía y Servicios</span>
                <div className="w-px h-6 bg-white/20" />
                <span className="text-white/60 text-sm">2026</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Content - Bottom Left */}
      <main className="relative z-10 flex items-end min-h-[calc(100vh-80px)]">
        <div className="container mx-auto px-6 pb-16">
          <div className="grid lg:grid-cols-2 gap-12 items-end">
            {/* Left Side - Hero Text */}
            <div className="space-y-6 max-w-xl">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20">
                <Building2 className="w-4 h-4 text-yellow-400" />
                <span className="text-white/90 text-sm font-medium">Conjunto Residencial</span>
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-tight">
                Gestiona tu
                <span className="block bg-gradient-to-r from-yellow-400 via-green-400 to-yellow-400 bg-clip-text text-transparent">
                  Energía
                </span>
                <span className="block text-4xl md:text-5xl lg:text-6xl mt-2">Fácilmente</span>
              </h1>
              <p className="text-lg text-white/70 max-w-md">
                Sistema integral de facturación, lecturas y control de pagos para tu conjunto residencial.
              </p>
              <div className="flex items-center gap-6 pt-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-green-500/20 border border-green-500/30 flex items-center justify-center">
                    <Moon className="w-4 h-4 text-green-400" />
                  </div>
                  <span className="text-white/80 text-sm">Alumbrado</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-blue-400" />
                  </div>
                  <span className="text-white/80 text-sm">Seguridad</span>
                </div>
              </div>
            </div>

            {/* Right Side - Login Form */}
            <div className="w-full max-w-md ml-auto">
              <div className="glass-card">
                <div className="p-8">
                  <div className="text-center mb-8">
                    <h2 className="text-2xl font-bold text-white mb-2">Iniciar Sesión</h2>
                    <p className="text-white/60 text-sm">Accede a tu cuenta para continuar</p>
                  </div>

                  {!adminMode && (
                    <p className="-mt-5 mb-6 text-center text-sm text-emerald-200">
                      Propietarios: usuario y clave son la cédula registrada.
                    </p>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {error && (
                      <div className="flex items-center gap-2 p-3 bg-red-500/20 border border-red-500/30 text-red-200 text-sm rounded-lg backdrop-blur-sm">
                        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="username" className="text-white/90 text-sm font-medium">Usuario</Label>
                      <div className="relative">
                        <Input
                          id="username"
                          type="text"
                          placeholder="Ingrese su usuario"
                          value={username}
                          onChange={(e) => {
                            setUsername(e.target.value);
                            clearError();
                          }}
                          required
                          className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-yellow-400 focus:ring-yellow-400/20 rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="password" className="text-white/90 text-sm font-medium">Contraseña</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          placeholder="Ingrese su contraseña"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value);
                            clearError();
                          }}
                          required
                          className="h-12 bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-yellow-400 focus:ring-yellow-400/20 rounded-xl pr-12"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white/80 transition-colors"
                        >
                          {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                        </button>
                      </div>
                    </div>

                    <Button 
                      type="submit" 
                      className="w-full h-12 bg-gradient-to-r from-yellow-500 to-green-500 hover:from-yellow-400 hover:to-green-400 text-white font-semibold rounded-xl shadow-lg shadow-yellow-500/25 transition-all duration-200 transform hover:scale-[1.02]"
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <span className="flex items-center gap-2">
                          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Iniciando sesión...
                        </span>
                      ) : (
                        'Iniciar Sesión'
                      )}
                    </Button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer Stats */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        <div className="glass-stats">
          <div className="container mx-auto px-6 py-4">
            <div className="flex flex-wrap items-center justify-center gap-8 md:gap-16">
              <div className="text-center">
                <p className="text-2xl font-bold text-white">186</p>
                <p className="text-xs text-white/50">Viviendas</p>
              </div>
              <div className="w-px h-8 bg-white/20 hidden md:block" />
              <div className="text-center">
                <p className="text-2xl font-bold text-white">4</p>
                <p className="text-xs text-white/50">Manzanas</p>
              </div>
              <div className="w-px h-8 bg-white/20 hidden md:block" />
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">98%</p>
                <p className="text-xs text-white/50">Recaudo</p>
              </div>
              <div className="w-px h-8 bg-white/20 hidden md:block" />
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-400">24/7</p>
                <p className="text-xs text-white/50">Activo</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .glass-header {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }

        .glass-card {
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 24px;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        }

        .glass-stats {
          background: rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-10px); }
        }

        .animate-float {
          animation: float 6s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
