import React from 'react';
import { useComunicados } from '../hooks/useComunicados';
import ComunicadoModal from './ComunicadoModal';

export default function GlobalComunicadoHandler() {
  const { comunicadoPendiente, marcarComoVisto } = useComunicados();

  return (
    <ComunicadoModal
      visible={!!comunicadoPendiente}
      comunicado={comunicadoPendiente}
      onClose={() => {
        if (comunicadoPendiente) {
          marcarComoVisto(comunicadoPendiente.id);
        }
      }}
    />
  );
}
