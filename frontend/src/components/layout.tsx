import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Home,
  FileText,
  ClipboardList,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
  Bell,
  Wifi,
  WifiOff,
  BarChart3,
  Receipt,
  User,
  DollarSign,
  ListChecks,
  Sun,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
}

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Viviendas', href: '/viviendas', icon: Home },
  { name: 'Lecturas', href: '/lecturas', icon: ClipboardList },
  { name: 'Facturación', href: '/facturacion', icon: ListChecks },
  { name: 'Control de Cobros y Pagos', href: '/control-pagos', icon: ListChecks },
  { name: 'Facturas', href: '/facturas', icon: FileText },
  { name: 'Registro de Pagos', href: '/registro-pagos', icon: DollarSign },
  { name: 'Reportes', href: '/reportes', icon: BarChart3 },
  { name: 'Estado de Cuenta', href: '/estado-cuenta', icon: Receipt },
  { name: 'Perfil', href: '/perfil', icon: User },
  { name: 'Usuarios', href: '/usuarios', icon: Users, roles: ['super_admin'] },
  { name: 'Configuración', href: '/configuracion', icon: Settings, roles: ['super_admin', 'editor'] },
];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { usuario, logout } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = React.useState(false);
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false);

  React.useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const filteredNav = navigation.filter((item) => {
    if (!item.roles) return true;
    return usuario && item.roles.includes(usuario.rol);
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-800 via-slate-700 to-slate-800">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-72 glass-sidebar">
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg">
                  <Sun className="h-6 w-6 text-white" />
                </div>
                <div>
                  <span className="font-bold text-white">Portales</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)} className="text-white/70 hover:text-white">
                <X className="h-5 w-5" />
              </Button>
            </div>
            <nav className="p-4 space-y-1">
              {filteredNav.map((item) => (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200',
                    location.pathname === item.href
                      ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 border border-yellow-500/30'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              ))}
            </nav>
          </div>
        </div>
      )}

      {/* Desktop Sidebar */}
      <div className={cn(
        'hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 glass-sidebar transition-all duration-300 z-40',
        sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg flex-shrink-0">
              <Sun className="h-6 w-6 text-white" />
            </div>
            {!sidebarCollapsed && (
              <div>
                <span className="font-bold text-white text-lg">Portales del Paraíso</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-white/50 hover:text-white"
          >
            {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => (
            <Link
              key={item.name}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group',
                location.pathname === item.href
                  ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 text-green-400 border border-yellow-500/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
              title={sidebarCollapsed ? item.name : undefined}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!sidebarCollapsed && <span>{item.name}</span>}
              {sidebarCollapsed && (
                <div className="absolute left-20 px-3 py-2 bg-slate-800 text-white text-sm rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all whitespace-nowrap z-50 shadow-xl">
                  {item.name}
                </div>
              )}
            </Link>
          ))}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-white/10">
          <div className={cn(
            'flex items-center gap-3 mb-4',
            sidebarCollapsed && 'justify-center'
          )}>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
              {usuario?.nombre_completo?.charAt(0) || 'U'}
            </div>
            {!sidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-white truncate">{usuario?.nombre_completo}</p>
                <p className="text-xs text-white/50 capitalize">{usuario?.rol?.replace('_', ' ')}</p>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            className={cn(
              'w-full border-white/20 text-white/70 hover:text-white hover:bg-white/10',
              sidebarCollapsed && 'px-2'
            )}
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {!sidebarCollapsed && 'Cerrar sesión'}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className={cn(
        'lg:transition-all lg:duration-300',
        sidebarCollapsed ? 'lg:pl-20' : 'lg:pl-72'
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 glass-header">
          <div className="flex items-center justify-between px-4 py-4 lg:px-8">
            <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>

            <div className="hidden lg:flex items-center gap-2 text-sm">
              <span className="text-white/40">Portales del Paraíso</span>
              <span className="text-white/20">/</span>
              <span className="text-white/70 capitalize">
                {location.pathname.replace('/', '').replace('-', ' ') || 'Dashboard'}
              </span>
            </div>

            <div className="flex items-center gap-3">
              {/* Online status */}
              <div className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium',
                isOnline
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-yellow-500/20 text-green-400 border border-yellow-500/30'
              )}>
                {isOnline ? (
                  <>
                    <Wifi className="h-3 w-3" />
                    <span>En línea</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3 w-3" />
                    <span>Sin conexión</span>
                  </>
                )}
              </div>

              <Button variant="ghost" size="icon" className="relative">
                <Bell className="h-5 w-5 text-white/70" />
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
              </Button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-8">
          {children}
        </main>
      </div>

      <style>{`
        .glass-sidebar {
          background: rgba(15, 23, 42, 0.8);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-right: 1px solid rgba(255, 255, 255, 0.05);
        }

        .glass-header {
          background: rgba(15, 23, 42, 0.6);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        }
      `}</style>
    </div>
  );
}
