// A small bundled list of makes, models, years and engines for the Add a car form. It is a POC list, not a full
// database: common cars in Morocco plus the owner's own. Anything missing can still be typed in with "Other".
import type { Fuel } from './garage';

export type Engine = { name: string; fuel: Fuel; kw: number; years?: [number, number]; gearbox?: string };
export type Model = { name: string; years: [number, number]; engines: Engine[] };
export type Make = { name: string; models: Model[] };

const e = (name: string, fuel: Fuel, kw: number, years?: [number, number], gearbox?: string): Engine => ({ name, fuel, kw, years, gearbox });
const NOW = new Date().getFullYear();

export const CATALOG: Make[] = [
  { name: 'Audi', models: [
    { name: 'A3 (8V)', years: [2012, 2020], engines: [e('1.4 TFSI', 'petrol', 92), e('1.6 TDI', 'diesel', 81), e('2.0 TDI', 'diesel', 110)] },
    { name: 'A4 (B8)', years: [2008, 2015], engines: [e('1.8 TFSI', 'petrol', 118), e('2.0 TDI', 'diesel', 105), e('3.0 TDI quattro', 'diesel', 176)] },
    { name: 'Q5 (8R)', years: [2008, 2017], engines: [e('2.0 TFSI quattro', 'petrol', 155), e('2.0 TDI quattro', 'diesel', 125)] },
  ] },
  { name: 'BMW', models: [
    { name: '3 Series (E90)', years: [2005, 2012], engines: [e('318i 2.0', 'petrol', 105), e('320d 2.0', 'diesel', 120), e('325i 2.5', 'petrol', 160)] },
    { name: '3 Series (F30)', years: [2012, 2019], engines: [e('318d 2.0', 'diesel', 105), e('320i 2.0', 'petrol', 135), e('330e 2.0', 'hybrid', 185, [2016, 2019])] },
    { name: '5 Series (E60)', years: [2003, 2010], engines: [
      e('520i 2.2 (M54)', 'petrol', 125, [2003, 2005], 'ZF 6HP19 automatic'), e('525i 2.5 (M54)', 'petrol', 141, [2003, 2005], 'ZF 6HP19 automatic'),
      e('530i 3.0 (M54)', 'petrol', 170, [2003, 2005], 'ZF 6HP19 automatic'), e('525i 2.5 (N52)', 'petrol', 160, [2005, 2010], 'ZF 6HP19 automatic'),
      e('520d 2.0 (M47)', 'diesel', 120, [2005, 2010]), e('530d 3.0 (M57)', 'diesel', 160, [2003, 2010], 'ZF 6HP26 automatic')] },
    { name: '5 Series (F10)', years: [2010, 2017], engines: [e('520d 2.0', 'diesel', 135), e('528i 2.0', 'petrol', 180), e('530d 3.0', 'diesel', 190)] },
    { name: 'X3 (F25)', years: [2010, 2017], engines: [e('xDrive20d 2.0', 'diesel', 135), e('xDrive28i 2.0', 'petrol', 180)] },
    { name: 'X5 (E53)', years: [2000, 2006], engines: [e('3.0i', 'petrol', 170), e('3.0d', 'diesel', 135), e('4.4i', 'petrol', 210)] },
    { name: 'X5 xDrive (E70)', years: [2007, 2013], engines: [
      e('xDrive30d 3.0', 'diesel', 173, [2007, 2013], 'ZF 6HP26 automatic'), e('xDrive35d 3.0', 'diesel', 210, [2008, 2013], 'ZF 6HP26 automatic'),
      e('xDrive30i 3.0', 'petrol', 200, [2007, 2010], 'ZF 6HP26 automatic'), e('xDrive40d 3.0', 'diesel', 225, [2010, 2013], 'ZF 8HP automatic')] },
    { name: 'X5 xDrive (F15)', years: [2013, 2018], engines: [e('xDrive25d 2.0', 'diesel', 160), e('xDrive30d 3.0', 'diesel', 190), e('xDrive40e 2.0', 'hybrid', 230, [2015, 2018])] },
  ] },
  { name: 'Citroën', models: [
    { name: 'C3', years: [2016, NOW], engines: [e('1.2 PureTech', 'petrol', 61), e('1.5 BlueHDi', 'diesel', 75)] },
    { name: 'C-Elysée', years: [2012, 2022], engines: [e('1.2 VTi', 'petrol', 60), e('1.6 HDi', 'diesel', 68)] },
    { name: 'Berlingo', years: [2008, NOW], engines: [e('1.6 HDi', 'diesel', 66), e('1.5 BlueHDi', 'diesel', 75, [2018, NOW])] },
  ] },
  { name: 'Dacia', models: [
    { name: 'Sandero', years: [2012, NOW], engines: [e('1.0 SCe', 'petrol', 54), e('1.0 TCe', 'petrol', 67, [2020, NOW]), e('1.5 dCi', 'diesel', 66, [2012, 2020]), e('1.0 TCe LPG', 'lpg', 74, [2020, NOW])] },
    { name: 'Duster', years: [2010, NOW], engines: [e('1.6 SCe', 'petrol', 84), e('1.5 dCi', 'diesel', 81), e('1.3 TCe', 'petrol', 110, [2018, NOW])] },
    { name: 'Jogger', years: [2022, NOW], engines: [e('1.0 TCe', 'petrol', 81), e('1.6 Hybrid', 'hybrid', 103, [2023, NOW])] },
  ] },
  { name: 'Fiat', models: [
    { name: 'Tipo', years: [2016, NOW], engines: [e('1.4', 'petrol', 70), e('1.3 Multijet', 'diesel', 70), e('1.6 Multijet', 'diesel', 88)] },
    { name: '500', years: [2007, NOW], engines: [e('1.2', 'petrol', 51), e('0.9 TwinAir', 'petrol', 63)] },
  ] },
  { name: 'Ford', models: [
    { name: 'Fiesta', years: [2008, 2023], engines: [e('1.25', 'petrol', 60), e('1.0 EcoBoost', 'petrol', 74, [2012, 2023]), e('1.5 TDCi', 'diesel', 55)] },
    { name: 'Focus', years: [2011, NOW], engines: [e('1.6', 'petrol', 92), e('1.0 EcoBoost', 'petrol', 92), e('1.5 TDCi', 'diesel', 88)] },
    { name: 'Kuga', years: [2013, NOW], engines: [e('1.5 EcoBoost', 'petrol', 110), e('2.0 TDCi', 'diesel', 110)] },
  ] },
  { name: 'Hyundai', models: [
    { name: 'i10', years: [2013, NOW], engines: [e('1.0', 'petrol', 49), e('1.2', 'petrol', 62)] },
    { name: 'Accent', years: [2011, NOW], engines: [e('1.4', 'petrol', 74), e('1.6 CRDi', 'diesel', 94)] },
    { name: 'Tucson', years: [2015, NOW], engines: [e('1.6 GDi', 'petrol', 97), e('1.7 CRDi', 'diesel', 85), e('1.6 T-GDi Hybrid', 'hybrid', 169, [2021, NOW])] },
  ] },
  { name: 'Kia', models: [
    { name: 'Picanto', years: [2011, NOW], engines: [e('1.0', 'petrol', 49), e('1.2', 'petrol', 62)] },
    { name: 'Sportage', years: [2010, NOW], engines: [e('1.6 GDi', 'petrol', 97), e('1.7 CRDi', 'diesel', 85), e('2.0 CRDi', 'diesel', 100)] },
  ] },
  { name: 'Mercedes-Benz', models: [
    { name: 'A-Class (W176)', years: [2012, 2018], engines: [e('A180 1.6', 'petrol', 90), e('A180 CDI 1.5', 'diesel', 80)] },
    { name: 'C-Class (W204)', years: [2007, 2014], engines: [e('C180 1.8', 'petrol', 115), e('C220 CDI 2.1', 'diesel', 125)] },
    { name: 'C-Class (W205)', years: [2014, 2021], engines: [e('C200 2.0', 'petrol', 135), e('C220d 2.1', 'diesel', 125)] },
    { name: 'E-Class (W212)', years: [2009, 2016], engines: [e('E200 CDI 2.1', 'diesel', 100), e('E250 CDI 2.1', 'diesel', 150), e('E350 3.5', 'petrol', 200)] },
  ] },
  { name: 'Nissan', models: [
    { name: 'Qashqai', years: [2014, NOW], engines: [e('1.2 DIG-T', 'petrol', 85), e('1.5 dCi', 'diesel', 81), e('1.6 dCi', 'diesel', 96)] },
    { name: 'Micra', years: [2017, 2023], engines: [e('1.0', 'petrol', 52), e('0.9 IG-T', 'petrol', 66)] },
  ] },
  { name: 'Opel', models: [
    { name: 'Corsa', years: [2014, NOW], engines: [e('1.2', 'petrol', 51), e('1.4', 'petrol', 66), e('1.3 CDTI', 'diesel', 55)] },
    { name: 'Astra', years: [2015, NOW], engines: [e('1.4 Turbo', 'petrol', 92), e('1.6 CDTI', 'diesel', 81)] },
  ] },
  { name: 'Peugeot', models: [
    { name: '208', years: [2012, NOW], engines: [e('1.2 PureTech', 'petrol', 60), e('1.6 HDi', 'diesel', 68), e('1.5 BlueHDi', 'diesel', 75, [2018, NOW])] },
    { name: '301', years: [2012, 2022], engines: [e('1.2 VTi', 'petrol', 60), e('1.6 HDi', 'diesel', 68)] },
    { name: '308', years: [2013, NOW], engines: [e('1.2 PureTech', 'petrol', 96), e('1.6 BlueHDi', 'diesel', 88)] },
    { name: '3008', years: [2016, NOW], engines: [e('1.2 PureTech', 'petrol', 96), e('1.5 BlueHDi', 'diesel', 96), e('2.0 BlueHDi', 'diesel', 130)] },
  ] },
  { name: 'Renault', models: [
    { name: 'Clio IV', years: [2012, 2019], engines: [e('1.2 16V', 'petrol', 55), e('0.9 TCe', 'petrol', 66), e('1.5 dCi', 'diesel', 66)] },
    { name: 'Clio V', years: [2019, NOW], engines: [e('1.0 TCe', 'petrol', 67), e('1.5 Blue dCi', 'diesel', 63), e('1.6 E-Tech', 'hybrid', 103)] },
    { name: 'Megane IV', years: [2016, NOW], engines: [e('1.3 TCe', 'petrol', 103), e('1.5 dCi', 'diesel', 81)] },
    { name: 'Kangoo', years: [2008, NOW], engines: [e('1.6', 'petrol', 66), e('1.5 dCi', 'diesel', 66)] },
  ] },
  { name: 'Seat', models: [
    { name: 'Ibiza', years: [2017, NOW], engines: [e('1.0 MPI', 'petrol', 59), e('1.0 TSI', 'petrol', 70), e('1.6 TDI', 'diesel', 70)] },
    { name: 'Leon', years: [2013, NOW], engines: [e('1.4 TSI', 'petrol', 92), e('2.0 TDI', 'diesel', 110)] },
  ] },
  { name: 'Skoda', models: [
    { name: 'Fabia', years: [2014, NOW], engines: [e('1.0 MPI', 'petrol', 55), e('1.0 TSI', 'petrol', 70), e('1.4 TDI', 'diesel', 66)] },
    { name: 'Octavia', years: [2013, NOW], engines: [e('1.4 TSI', 'petrol', 110), e('1.6 TDI', 'diesel', 81), e('2.0 TDI', 'diesel', 110)] },
  ] },
  { name: 'Toyota', models: [
    { name: 'Yaris', years: [2011, NOW], engines: [e('1.0 VVT-i', 'petrol', 51), e('1.5 Hybrid', 'hybrid', 85, [2012, NOW], 'e-CVT')] },
    { name: 'Corolla', years: [2013, NOW], engines: [e('1.6 Valvematic', 'petrol', 97), e('1.4 D-4D', 'diesel', 66, [2013, 2018]), e('1.8 Hybrid', 'hybrid', 90, [2019, NOW], 'e-CVT')] },
    { name: 'RAV4', years: [2013, NOW], engines: [e('2.0', 'petrol', 112), e('2.5 Hybrid', 'hybrid', 160, [2016, NOW], 'e-CVT')] },
    { name: 'Hilux', years: [2015, NOW], engines: [e('2.4 D-4D', 'diesel', 110), e('2.8 D-4D', 'diesel', 150)] },
  ] },
  { name: 'Volkswagen', models: [
    { name: 'Polo', years: [2009, NOW], engines: [e('1.0 MPI', 'petrol', 55), e('1.2 TSI', 'petrol', 66), e('1.6 TDI', 'diesel', 66)] },
    { name: 'Golf 7', years: [2012, 2020], engines: [e('1.2 TSI', 'petrol', 77), e('1.4 TSI', 'petrol', 92), e('1.6 TDI', 'diesel', 81), e('2.0 TDI', 'diesel', 110)] },
    { name: 'Passat (B8)', years: [2014, 2023], engines: [e('1.4 TSI', 'petrol', 110), e('2.0 TDI', 'diesel', 110)] },
    { name: 'Tiguan', years: [2016, NOW], engines: [e('1.4 TSI', 'petrol', 110), e('2.0 TDI', 'diesel', 110)] },
  ] },
];

export const GEARBOXES = ['Manual', 'Automatic', 'Dual-clutch (DSG/EDC)', 'CVT', 'e-CVT'];

export const makeNames = () => CATALOG.map(m => m.name);
export const findMake = (make: string) => CATALOG.find(m => m.name === make);
export const findModel = (make: string, model: string) => findMake(make)?.models.find(m => m.name === model);
export function yearsFor(make: string, model: string): string[] {
  const m = findModel(make, model);
  if (!m) return [];
  const out: string[] = [];
  for (let y = Math.min(NOW, m.years[1]); y >= m.years[0]; y--) out.push(String(y));
  return out;
}
export function enginesFor(make: string, model: string, year: string): Engine[] {
  const m = findModel(make, model), y = +year;
  if (!m) return [];
  return m.engines.filter(en => !y || !en.years || (y >= en.years[0] && y <= en.years[1]));
}
export const engineLabel = (en: Engine) => `${en.name} · ${en.kw} kW`;
