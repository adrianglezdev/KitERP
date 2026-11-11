import type { ModuleDef } from '../core/modules';
import fic from './fic';
import hor from './hor';
import aus from './aus';
import nom from './nom';
import alt from './alt';
import por from './por';
import crm from './crm';
import opo from './opo';
import pre from './pre';
import ped from './ped';
import fac from './fac';
import stk from './stk';
import cpr from './cpr';
import pry from './pry';
import sat from './sat';
import act from './act';
import dtc from './dtc';
import tes from './tes';
import cnt from './cnt';
import gas from './gas';
import bi from './bi';

/** Todos los módulos con lógica de servidor. El orden solo afecta a la carga de datos de ejemplo (stock antes que ventas); los eventos se resuelven por suscripción. */
export const moduleDefs: ModuleDef[] = [fic, hor, aus, nom, alt, por, stk, crm, opo, pre, ped, fac, cpr, pry, sat, act, dtc, tes, cnt, gas, bi];
