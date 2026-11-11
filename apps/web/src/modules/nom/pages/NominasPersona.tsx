import { ListaRecibos } from '../comun';

/** Pestaña "Nóminas" en la ficha de la persona (solo RRHH). */
export default function NominasPersona({ id }: { id: string }) {
  return <ListaRecibos url={`/nom/recibos?personaId=${id}`} />;
}
