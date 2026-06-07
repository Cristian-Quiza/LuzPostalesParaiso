import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Usuario } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type GenerarClientesResponse = {
  creados: number;
  actualizados?: number;
  omitidos: number;
  usuarios: Array<{ casa: string; cedula: string; username: string; estado?: string }>;
  omitidos_list?: Array<{ casa: string; cedula?: string; propietario?: string; motivo: string }>;
};

export default function UsuariosPage() {
  const { token } = useAuthStore();
  const queryClient = useQueryClient();

  const { data: usuarios, isLoading } = useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn: () => api.get<Usuario[]>('/usuarios?limit=1000', token || undefined),
    enabled: !!token,
  });

  const generarClientesMutation = useMutation({
    mutationFn: () => api.post<GenerarClientesResponse>('/usuarios/generar-clientes', {}, token || undefined),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['usuarios'] });
      toast.success('Usuarios propietarios generados', {
        description: `${result.creados} creados, ${result.omitidos} omitidos porque ya existían o no tenían cédula.`,
      });
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : 'No se pudieron generar usuarios');
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Usuarios</h1>
          <p className="text-sm text-emerald-300">
            Propietarios: usuario y contraseña iguales a la cédula; se omiten OFICINA, VACIA/VACÍA y registros sin cédula.
          </p>
          <p className="text-muted-foreground">Administración y generación de accesos para propietarios.</p>
        </div>
        <Button onClick={() => generarClientesMutation.mutate()} disabled={generarClientesMutation.isPending} className="bg-green-600 hover:bg-green-700">
          <UserPlus className="mr-2 h-4 w-4" />
          {generarClientesMutation.isPending ? 'Generando...' : 'Generar usuarios propietarios'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Usuarios del sistema</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>Cargando usuarios...</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Usuario</TableHead>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Rol</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(usuarios || []).map((usuario) => (
                  <TableRow key={usuario.id}>
                    <TableCell className="font-medium">{usuario.username}</TableCell>
                    <TableCell>{usuario.nombre_completo}</TableCell>
                    <TableCell>{usuario.email}</TableCell>
                    <TableCell>{usuario.rol}</TableCell>
                    <TableCell>{usuario.is_active ? 'Activo' : 'Inactivo'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
