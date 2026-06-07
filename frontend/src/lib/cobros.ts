import {
  CalculoCobroInput,
  CalculoCobroResult,
  EstadoCobroMensual,
  LecturaMensualCalculada,
  PagoMensual,
} from '@/types';

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function calcularCobroLectura(input: CalculoCobroInput): CalculoCobroResult {
  const { lecturaAnterior, lecturaActual, cargosFijosTotal, configuracion } = input;

  if (lecturaActual < lecturaAnterior) {
    throw new Error('La lectura actual no puede ser menor que la lectura anterior');
  }

  const consumoTotal = lecturaActual - lecturaAnterior;
  const consumoConSubsidio = Math.min(consumoTotal, configuracion.limiteSubsidio);
  const consumoSinSubsidio = Math.max(consumoTotal - configuracion.limiteSubsidio, 0);

  const valorSubsidiado = round2(consumoConSubsidio * configuracion.tarifaSubsidiada);
  const valorSinSubsidio = round2(consumoSinSubsidio * configuracion.tarifaPlena);
  const totalCobrar = round2(valorSubsidiado + valorSinSubsidio + cargosFijosTotal);

  return {
    consumoTotal,
    consumoConSubsidio,
    consumoSinSubsidio,
    valorSubsidiado,
    valorSinSubsidio,
    cargosFijosTotal: round2(cargosFijosTotal),
    totalCobrar,
  };
}

export function recalcularLecturaMensual(
  lectura: Omit<LecturaMensualCalculada, 'calculo'>,
  input: Omit<CalculoCobroInput, 'lecturaAnterior' | 'lecturaActual'>
): LecturaMensualCalculada {
  if (lectura.estadoCasa !== 'activa') {
    return { ...lectura, calculo: undefined };
  }
  if (lectura.lecturaActual === null || lectura.lecturaActual === undefined) {
    return { ...lectura, calculo: undefined };
  }

  const calculo = calcularCobroLectura({
    lecturaAnterior: lectura.lecturaAnterior,
    lecturaActual: lectura.lecturaActual,
    cargosFijosTotal: input.cargosFijosTotal,
    configuracion: input.configuracion,
  });

  return { ...lectura, calculo };
}

export function calcularSaldoMensual(
  cedula: string,
  anio: number,
  mes: number,
  totalCobrar: number,
  pagos: PagoMensual[]
): { totalPagadoMes: number; saldoMes: number; estado: EstadoCobroMensual } {
  const totalPagadoMes = round2(
    pagos
      .filter((p) => p.cedula === cedula && p.anio === anio && p.mes === mes)
      .reduce((acc, p) => acc + (p.abono || 0), 0)
  );
  const saldoMes = round2(totalCobrar - totalPagadoMes);

  let estado: EstadoCobroMensual = 'DEBE';
  if (saldoMes <= 1) estado = 'PAGADO';
  else if (totalPagadoMes > 0) estado = 'PARCIAL';

  return { totalPagadoMes, saldoMes, estado };
}
