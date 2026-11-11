import type { Tx } from '../../db/client';
import type { SeedCtx } from '../../core/modules';
import { addDays, hoyMadrid } from '../hor/tiempo';
import { ficCambios, ficFormacion, ficHistorial, ficPrl, ficTrabajadores } from './schema';

const LETRAS = 'TRWAGMYFPDXBNJZSQVHLCKE';
export const dniDemo = (n: number) => `${String(n).padStart(8, '0')}${LETRAS[n % 23]}`;

/** Datos laborales de ejemplo por persona (clave del seed del núcleo). */
export const FICHAS_DEMO: Record<string, { dni: number; sexo: string; nac: string; cat: string; grupo: string; contrato: string; jornada: number; salario: number; alta: number; finContrato?: number; finPrueba?: number; localidad: string }> = {
  admin: { dni: 20456781, sexo: 'hombre', nac: '1986-04-12', cat: 'Técnico de sistemas', grupo: '2', contrato: 'indefinido', jornada: 40, salario: 36000, alta: -2400, localidad: 'Valencia' },
  direccion: { dni: 19876543, sexo: 'mujer', nac: '1974-09-03', cat: 'Directora general', grupo: '1', contrato: 'indefinido', jornada: 40, salario: 62000, alta: -4300, localidad: 'Valencia' },
  administracion: { dni: 24567812, sexo: 'hombre', nac: '1981-01-27', cat: 'Jefe administrativo', grupo: '3', contrato: 'indefinido', jornada: 40, salario: 34000, alta: -3100, localidad: 'Mislata' },
  rrhh: { dni: 29345671, sexo: 'mujer', nac: '1990-06-18', cat: 'Técnica de RRHH', grupo: '2', contrato: 'indefinido', jornada: 40, salario: 31000, alta: -1500, localidad: 'Valencia' },
  comercial1: { dni: 33456120, sexo: 'mujer', nac: '1985-11-02', cat: 'Jefa de ventas', grupo: '3', contrato: 'indefinido', jornada: 40, salario: 38000, alta: -2900, localidad: 'Burjassot' },
  comercial2: { dni: 44567231, sexo: 'hombre', nac: '1994-03-21', cat: 'Comercial', grupo: '5', contrato: 'indefinido', jornada: 40, salario: 26000, alta: -800, localidad: 'Paterna' },
  almacen: { dni: 21678342, sexo: 'hombre', nac: '1979-07-14', cat: 'Encargado de almacén', grupo: '3', contrato: 'indefinido', jornada: 40, salario: 29000, alta: -3600, localidad: 'Paterna' },
  operario: { dni: 48789453, sexo: 'hombre', nac: '2000-02-08', cat: 'Mozo de almacén', grupo: '10', contrato: 'temporal', jornada: 40, salario: 19000, alta: -150, finContrato: 24, finPrueba: -120, localidad: 'Manises' },
  jefesat: { dni: 22890564, sexo: 'mujer', nac: '1983-12-01', cat: 'Responsable técnica', grupo: '2', contrato: 'indefinido', jornada: 40, salario: 39000, alta: -3300, localidad: 'Valencia' },
  tecnico1: { dni: 45901675, sexo: 'hombre', nac: '1991-05-30', cat: 'Oficial de 1.ª', grupo: '8', contrato: 'indefinido', jornada: 40, salario: 25500, alta: -1900, localidad: 'Torrent' },
  tecnico2: { dni: 53012786, sexo: 'mujer', nac: '1997-08-25', cat: 'Oficial de 2.ª', grupo: '8', contrato: 'indefinido', jornada: 40, salario: 23500, alta: -55, finPrueba: 5, localidad: 'Alboraia' },
};

export async function seedFic(tx: Tx, s: SeedCtx) {
  const hoy = hoyMadrid();
  const empresaId = s.empresaId;
  let i = 0;
  for (const [key, d] of Object.entries(FICHAS_DEMO)) {
    const personaId = s.personas[key];
    if (!personaId) continue;
    i++;
    const alta = addDays(hoy, d.alta);
    await tx.insert(ficTrabajadores).values({
      empresaId,
      personaId,
      dni: dniDemo(d.dni),
      nss: `46 ${String(10000000 + d.dni).slice(0, 8)} ${String(10 + i * 7).slice(0, 2)}`,
      fechaNacimiento: d.nac,
      sexo: d.sexo,
      nacionalidad: 'Española',
      direccion: `Calle ${['Sueca', 'Cuba', 'Literato Azorín', 'Doctor Sumsi', 'Mayor', 'Colón', 'Sant Vicent', 'Valencia', 'Major', 'Llano', 'Serrería'][i - 1]} ${10 + i}`,
      codigoPostal: `460${String(10 + i).padStart(2, '0')}`,
      localidad: d.localidad,
      provincia: 'Valencia',
      telefonoPersonal: `6${String(d.dni).slice(0, 8)}`,
      contactoEmergencia: ['María Soler', 'Pedro Martín', 'Lucía Pastor', 'Jorge Gil', 'Carmen Ibáñez', 'Rosa Marco', 'Teresa Roig', 'Antonio Vila', 'José Calvo', 'Marta Peris', 'Juan Bas'][i - 1],
      telefonoEmergencia: `6${String(d.dni + 1111).slice(0, 8)}`,
      iban: 'ES9121000418450200051332',
      convenio: 'Convenio colectivo de la industria del metal de la provincia de Valencia',
      categoria: d.cat,
      grupoCotizacion: d.grupo,
      tipoContrato: d.contrato,
      jornadaHoras: d.jornada,
      salarioBruto: d.salario,
      fechaAlta: alta,
      finPeriodoPrueba: d.finPrueba !== undefined ? addDays(hoy, d.finPrueba) : null,
      finContrato: d.finContrato !== undefined ? addDays(hoy, d.finContrato) : null,
      validado: key !== 'comercial2',
    });
    await tx.insert(ficHistorial).values({ empresaId, personaId, fecha: alta, tipo: 'alta', descripcion: 'Alta en la empresa', origen: 'auto' });
  }

  const p = s.personas;
  // Historial de ejemplo
  await tx.insert(ficHistorial).values([
    { empresaId, personaId: p.tecnico1!, fecha: addDays(hoy, -400), tipo: 'ascenso', descripcion: 'Categoría profesional: cambio registrado', valorAnterior: 'Oficial de 2.ª', valorNuevo: 'Oficial de 1.ª', origen: 'manual', campo: 'categoria' },
    { empresaId, personaId: p.tecnico1!, fecha: addDays(hoy, -400), tipo: 'salario', descripcion: 'Revisión salarial por ascenso', valorAnterior: '23.000,00 €', valorNuevo: '25.500,00 €', origen: 'manual', campo: 'salarioBruto' },
    { empresaId, personaId: p.comercial1!, fecha: addDays(hoy, -700), tipo: 'ascenso', descripcion: 'Promoción a jefa de ventas', valorAnterior: 'Comercial', valorNuevo: 'Jefa de ventas', origen: 'manual' },
    { empresaId, personaId: p.rrhh!, fecha: addDays(hoy, -300), tipo: 'jornada', descripcion: 'Vuelve a jornada completa tras reducción por cuidado de menor', valorAnterior: '30 h/semana', valorNuevo: '40 h/semana', origen: 'manual', campo: 'jornadaHoras' },
  ]);

  // Formación
  await tx.insert(ficFormacion).values([
    { empresaId, personaId: p.tecnico1!, curso: 'Manipulación de gases fluorados (RD 115/2017)', tipo: 'obligatoria', entidad: 'Centro de Formación Levante', fecha: addDays(hoy, -1800), horas: 60, caduca: addDays(hoy, 40), coste: 450, bonificada: true },
    { empresaId, personaId: p.tecnico2!, curso: 'Manipulación de gases fluorados (RD 115/2017)', tipo: 'obligatoria', entidad: 'Centro de Formación Levante', fecha: addDays(hoy, -200), horas: 60, caduca: addDays(hoy, 1625), coste: 450, bonificada: true },
    { empresaId, personaId: p.tecnico1!, curso: 'Trabajos en altura y uso de plataformas elevadoras (PEMP)', tipo: 'obligatoria', entidad: 'Prevención Turia', fecha: addDays(hoy, -1080), horas: 8, caduca: addDays(hoy, 12), coste: 120 },
    { empresaId, personaId: p.almacen!, curso: 'Carretillero: conducción de carretillas elevadoras', tipo: 'obligatoria', entidad: 'Prevención Turia', fecha: addDays(hoy, -900), horas: 12, caduca: addDays(hoy, 200), coste: 180, bonificada: true },
    { empresaId, personaId: p.operario!, curso: 'Carretillero: conducción de carretillas elevadoras', tipo: 'obligatoria', entidad: 'Prevención Turia', fecha: addDays(hoy, -100), horas: 12, caduca: addDays(hoy, 995), coste: 180, bonificada: true },
    { empresaId, personaId: p.comercial1!, curso: 'Negociación comercial avanzada', tipo: 'habilidades', entidad: 'Escuela de Negocios del Mediterráneo', fecha: addDays(hoy, -240), horas: 20, coste: 690, bonificada: true },
    { empresaId, personaId: p.administracion!, curso: 'Verifactu y factura electrónica', tipo: 'tecnica', entidad: 'Colegio de Economistas', fecha: addDays(hoy, -60), horas: 6, coste: 90 },
    { empresaId, personaId: p.rrhh!, curso: 'Registro retributivo y planes de igualdad', tipo: 'tecnica', entidad: 'Cámara de Comercio', fecha: addDays(hoy, -130), horas: 16, coste: 240, bonificada: true },
  ]);

  // PRL
  const prl: (typeof ficPrl.$inferInsert)[] = [];
  for (const key of ['almacen', 'operario', 'jefesat', 'tecnico1', 'tecnico2']) {
    const off = key === 'tecnico1' ? -355 : key === 'operario' ? -140 : -200;
    prl.push({ empresaId, personaId: p[key]!, tipo: 'reconocimiento', descripcion: 'Reconocimiento médico anual', fecha: addDays(hoy, off), caduca: addDays(hoy, off + 365), resultado: 'apto', entidad: 'Quirón Prevención' });
    prl.push({ empresaId, personaId: p[key]!, tipo: 'curso_prl', descripcion: key === 'operario' || key === 'almacen' ? 'PRL 20 h · almacén y logística' : 'PRL 20 h · electricidad y climatización (TPC)', fecha: addDays(hoy, off - 10), horas: 20, entidad: 'Fundación Laboral del Metal' });
  }
  prl.push({
    empresaId,
    personaId: p.tecnico1!,
    tipo: 'epi',
    descripcion: 'Equipos de protección para instalaciones',
    fecha: addDays(hoy, -300),
    epis: [
      { nombre: 'Botas de seguridad S3', talla: '43', cantidad: 1 },
      { nombre: 'Guantes dieléctricos clase 0', talla: '9', cantidad: 1 },
      { nombre: 'Gafas de protección', cantidad: 1 },
    ],
    firmadoEn: new Date(Date.now() - 300 * 86400000),
    firmaHash: 'seed',
  });
  prl.push({
    empresaId,
    personaId: p.operario!,
    tipo: 'epi',
    descripcion: 'Equipos de protección para almacén',
    fecha: addDays(hoy, -2),
    epis: [
      { nombre: 'Botas de seguridad S3', talla: '42', cantidad: 1 },
      { nombre: 'Chaleco reflectante', talla: 'L', cantidad: 1 },
      { nombre: 'Guantes anticorte nivel 3', talla: '9', cantidad: 2 },
    ],
  });
  prl.push({
    empresaId,
    personaId: p.tecnico2!,
    tipo: 'epi',
    descripcion: 'Equipos de protección para instalaciones',
    fecha: addDays(hoy, -50),
    epis: [
      { nombre: 'Botas de seguridad S3', talla: '38', cantidad: 1 },
      { nombre: 'Arnés anticaídas con doble cabo', cantidad: 1 },
      { nombre: 'Casco con barboquejo', cantidad: 1 },
    ],
  });
  await tx.insert(ficPrl).values(prl);

  // Un cambio propuesto por el trabajador, pendiente de validar
  await tx.insert(ficCambios).values({
    empresaId,
    personaId: p.comercial2!,
    datos: { direccion: 'Avenida Vicente Mortes 45, 3.º B', codigoPostal: '46980', localidad: 'Paterna', telefonoPersonal: '611223344' },
    comentario: 'Me he mudado este mes.',
  });
}
