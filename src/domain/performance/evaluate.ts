import { invariant } from '../errors.ts';
import type { PerformanceInput, PerformanceSnapshot } from '../types.ts';

function correctedSpeed(input: PerformanceInput): number {
  return input.rpm * Math.sqrt(input.referenceTemperatureK / input.ambientTemperatureK);
}

function correctedFlow(input: PerformanceInput): number {
  const temperatureFactor = Math.sqrt(input.ambientTemperatureK / input.referenceTemperatureK);
  const pressureFactor = input.referencePressureKpa / input.ambientPressureKpa;
  return input.fuelFlowKgPerSecond * temperatureFactor * pressureFactor;
}

function estimateEfficiency(input: PerformanceInput, correctedRpm: number, pressureRatio: number): number {
  const speedDelta = (correctedRpm - input.referenceRpm) / Math.max(input.referenceRpm, 1);
  const pressurePenalty = Math.max(0, pressureRatio - 8) * 0.03;
  return Math.max(0, Math.min(1, 0.72 + 0.02 * speedDelta - pressurePenalty));
}

export function evaluatePerformance(input: PerformanceInput): PerformanceSnapshot {
  for (const [key, value] of Object.entries(input)) if (typeof value === 'number') invariant(Number.isFinite(value), 'INVALID_PERFORMANCE_INPUT', `Performance input ${key} must be finite`, { key, value });
  invariant(input.ambientTemperatureK > 0 && input.referenceTemperatureK > 0 && input.turbineInletTemperatureK > 0, 'INVALID_TEMPERATURE', 'Temperatures must be in Kelvin and positive');
  invariant(input.ambientPressureKpa > 0 && input.inletPressureKpa > 0 && input.compressorOutletPressureKpa > 0, 'INVALID_PRESSURE', 'Pressures must be absolute and positive');
  invariant(input.referenceRpm > 0 && input.rpm >= 0 && input.fuelFlowKgPerSecond >= 0, 'INVALID_ENGINE_STATE', 'RPM and fuel flow are outside physical bounds');
  invariant(input.referencePressureKpa > 0, 'INVALID_REFERENCE_STATE', 'Reference pressure must be positive');
  const pressureRatio = input.compressorOutletPressureKpa / input.inletPressureKpa;
  const correctedRpm = correctedSpeed(input);
  const correctedFuelFlowKgPerSecond = correctedFlow(input);
  const thermalMarginK = Math.max(0, 1_150 - input.turbineInletTemperatureK);
  const compressorEfficiency = estimateEfficiency(input, correctedRpm, pressureRatio);
  const baseline = input.baselineThrustKn ?? 0;
  const estimatedThrustKn = baseline + correctedFuelFlowKgPerSecond * 42 * compressorEfficiency * Math.log1p(Math.max(0, pressureRatio));
  return { ...input, pressureRatio, correctedRpm, correctedFuelFlowKgPerSecond, estimatedThrustKn, compressorEfficiency, thermalMarginK };
}
