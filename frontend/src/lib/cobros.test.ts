import { describe, expect, it } from 'vitest';
import { calcularCobroLectura, calcularSaldoMensual } from './cobros';

describe('calcularCobroLectura', () => {
  it('calcula igual que el ejemplo de Excel cuando el consumo no supera subsidio', () => {
    const result = calcularCobroLectura({
      lecturaAnterior: 3417,
      lecturaActual: 3483,
      cargosFijosTotal: 6000,
      configuracion: {
        anio: 2026,
        mes: 3,
        limiteSubsidio: 184,
        tarifaSubsidiada: 365.45,
        tarifaPlena: 783,
      },
    });

    expect(result.consumoTotal).toBe(66);
    expect(result.consumoConSubsidio).toBe(66);
    expect(result.consumoSinSubsidio).toBe(0);
    expect(result.valorSubsidiado).toBe(24119.7);
    expect(result.valorSinSubsidio).toBe(0);
    expect(result.totalCobrar).toBe(30119.7);
  });

  it('separa excedente sin subsidio cuando consumo supera el límite', () => {
    const result = calcularCobroLectura({
      lecturaAnterior: 1000,
      lecturaActual: 1304,
      cargosFijosTotal: 9000,
      configuracion: {
        anio: 2026,
        mes: 3,
        limiteSubsidio: 184,
        tarifaSubsidiada: 365.45,
        tarifaPlena: 783,
      },
    });

    expect(result.consumoTotal).toBe(304);
    expect(result.consumoConSubsidio).toBe(184);
    expect(result.consumoSinSubsidio).toBe(120);
    expect(result.valorSubsidiado).toBe(67242.8);
    expect(result.valorSinSubsidio).toBe(93960);
    expect(result.totalCobrar).toBe(170202.8);
  });

  it('falla cuando lectura actual es menor que anterior', () => {
    expect(() =>
      calcularCobroLectura({
        lecturaAnterior: 500,
        lecturaActual: 499,
        cargosFijosTotal: 0,
        configuracion: {
          anio: 2026,
          mes: 3,
          limiteSubsidio: 184,
          tarifaSubsidiada: 365.45,
          tarifaPlena: 783,
        },
      })
    ).toThrow('La lectura actual no puede ser menor que la lectura anterior');
  });
});

describe('calcularSaldoMensual', () => {
  it('calcula estado PARCIAL por cédula, año y mes', () => {
    const saldo = calcularSaldoMensual('40361567', 2026, 1, 42040, [
      { cedula: '40361567', anio: 2026, mes: 1, abono: 10000 },
      { cedula: '40361567', anio: 2026, mes: 1, abono: 5000 },
      { cedula: '999', anio: 2026, mes: 1, abono: 99999 },
    ]);
    expect(saldo.totalPagadoMes).toBe(15000);
    expect(saldo.saldoMes).toBe(27040);
    expect(saldo.estado).toBe('PARCIAL');
  });
});
