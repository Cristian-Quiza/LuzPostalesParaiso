import React, { useState, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { User, Camera, AlertCircle, CheckCircle } from 'lucide-react';

export default function PerfilPage() {
  const { usuario, token } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  const [formData, setFormData] = useState({
    nombre_completo: usuario?.nombre_completo || '',
    telefono: usuario?.telefono || '',
    whatsapp: usuario?.whatsapp || '',
    email: usuario?.email || '',
  });
  
  const [fotoPerfil, setFotoPerfil] = useState<string | null>(usuario?.foto_perfil || null);
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, []);

  const handleFile = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Por favor selecciona una imagen' });
      return;
    }
    
    if (file.size > 2 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'La imagen debe ser menor a 2MB' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setFotoPerfil(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    
    try {
      await api.put('/usuarios/' + usuario?.id, {
        nombre_completo: formData.nombre_completo,
        telefono: formData.telefono,
        whatsapp: formData.whatsapp,
        email: formData.email,
        foto_perfil: fotoPerfil,
      }, token || undefined);
      
      setMessage({ type: 'success', text: 'Perfil actualizado correctamente' });
      setIsEditing(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al actualizar el perfil' });
    }
    
    setSaving(false);
  };

  const getRoleName = (rol: string) => {
    switch (rol) {
      case 'super_admin': return 'Administrador Principal';
      case 'editor': return 'Editor';
      case 'lector': return 'Lector';
      default: return rol;
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-3xl font-bold">Perfil</h1>
        <p className="text-muted-foreground">Gestiona tu información personal</p>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} className={message.type === 'success' ? 'border-green-500 bg-green-500/10' : ''}>
          {message.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Foto de perfil */}
      <Card>
        <CardHeader>
          <CardTitle>Foto de Perfil</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center">
            <div
              className={cn(
                "relative w-32 h-32 rounded-full overflow-hidden border-4 border-dashed cursor-pointer transition-colors",
                isDragging ? "border-primary bg-primary/10" : "border-muted",
                !fotoPerfil && "bg-muted"
              )}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => document.getElementById('file-input')?.click()}
            >
              {fotoPerfil ? (
                <img src={fotoPerfil} alt="Foto de perfil" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                <Camera className="h-8 w-8 text-white" />
              </div>
            </div>
            <input
              id="file-input"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileSelect}
            />
            <p className="text-sm text-muted-foreground mt-2 text-center">
              Arrastra una imagen o haz clic para seleccionar
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Información personal */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Información Personal</CardTitle>
            <CardDescription>Tu información de cuenta</CardDescription>
          </div>
          <Button variant={isEditing ? "default" : "outline"} onClick={() => isEditing ? handleSave() : setIsEditing(true)}>
            {isEditing ? (saving ? 'Guardando...' : 'Guardar') : 'Editar'}
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Username (no editable) */}
          <div className="grid gap-2">
            <Label>Usuario</Label>
            <Input value={usuario?.username || ''} disabled className="bg-muted" />
          </div>

          {/* Nombre completo */}
          <div className="grid gap-2">
            <Label>Nombre Completo</Label>
            <Input
              value={formData.nombre_completo}
              onChange={(e) => setFormData({ ...formData, nombre_completo: e.target.value })}
              disabled={!isEditing}
              placeholder="Tu nombre completo"
            />
          </div>

          {/* Email */}
          <div className="grid gap-2">
            <Label>Email</Label>
            <Input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              disabled={!isEditing}
              placeholder="tu@email.com"
            />
          </div>

          {/* Teléfono */}
          <div className="grid gap-2">
            <Label>Teléfono</Label>
            <Input
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              disabled={!isEditing}
              placeholder="+57 300 123 4567"
            />
          </div>

          {/* WhatsApp */}
          <div className="grid gap-2">
            <Label>WhatsApp</Label>
            <Input
              value={formData.whatsapp}
              onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
              disabled={!isEditing}
              placeholder="+57 300 123 4567"
            />
          </div>

          {/* Rol */}
          <div className="grid gap-2">
            <Label>Rol</Label>
            <Input value={getRoleName(usuario?.rol || '')} disabled className="bg-muted" />
          </div>
        </CardContent>
      </Card>

      {isEditing && (
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setIsEditing(false)}>Cancelar</Button>
        </div>
      )}

      <style>{`
        .glass-card {
          background: rgba(255, 255, 255, 0.05);
          backdrop-filter: blur(20px);
          -webkit-backdrop-filter: blur(20px);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 16px;
        }
        
        .glass-button {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          color: white;
        }
        
        .glass-button:hover {
          background: rgba(255, 255, 255, 0.1);
          border-color: rgba(255, 255, 255, 0.2);
        }
      `}</style>
    </div>
  );
}