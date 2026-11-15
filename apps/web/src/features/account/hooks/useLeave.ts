// «Cerrar sesión» of «Datos de usuario»: signs out and goes to the landing page, saying meanwhile that it is leaving.
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { paths } from '../../../shared/lib/paths';
import { useSession } from '../../session/context';

export function useLeave() {
  const { signOut } = useSession();
  const navigate = useNavigate();
  const [leaving, setLeaving] = useState(false);
  const leave = async () => {
    setLeaving(true);
    await signOut();
    void navigate(paths.landing());
  };
  return { leaving, leave };
}
