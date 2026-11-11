import { defineModule } from '../../core/modules';
import { biRoutes, enviarProgramados } from './routes';

export default defineModule({
  code: 'bi',
  routes: biRoutes,
  jobs: [{ id: 'bi.envios', dailyAt: '07:00', run: async (empresaId) => `${await enviarProgramados(empresaId)} informes enviados` }],
});
