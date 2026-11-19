// Characterizes the landing page: the two sign-in buttons while Google opens and when it fails, the notices of the
// URL, and the text nodes of its lines.
import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../../../test/render';

const textNodes = (el: Node) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  while (walker.nextNode()) out.push(walker.currentNode.nodeValue ?? '');
  return out;
};

describe('signing in', () => {
  it('both buttons say Google is opening and wait, and the attempt goes to the destination', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/?next=%2Fhome', { session: null });
    const big = await screen.findByRole('button', { name: 'Entrar con Google' });
    expect(textNodes(big)).toEqual([' ', 'Entrar con Google']);
    const small = screen.getByRole('button', { name: 'Entrar' });
    expect(textNodes(small)).toEqual([' Entrar']);
    let opened: () => void = () => undefined;
    session.signInWithGoogle = (next) => {
      session.signIns.push(next);
      return new Promise((resolve) => (opened = resolve));
    };
    await user.click(big);
    expect(screen.getByRole('button', { name: 'Abriendo Google…' })).toBeDisabled();
    expect(small).toBeDisabled();
    expect(session.signIns).toEqual(['/home']);
    await act(async () => opened());
  });

  it('when Google cannot be opened, says so as an error and lets try again', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/', { session: null });
    session.signInWithGoogle = async () => {
      throw new Error('red');
    };
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(
      await screen.findByText('No se pudo abrir Google. Revisa tu conexión e intenta de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.getByText('No se pudo entrar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entrar con Google' })).toBeEnabled();
  });
});

describe('the page', () => {
  it('the notice of a deletion has its own title', async () => {
    renderApp('/?notice=deletion', { session: null });
    expect(await screen.findByText('Tu cuenta se eliminará')).toBeInTheDocument();
  });

  it('the lines of the top, with their text nodes', async () => {
    renderApp('/', { session: null });
    expect(await screen.findByText('Medicina · Universidad de Chile')).toBeInTheDocument();
    expect(screen.getByText('Por ahora entran solo personas invitadas.')).toBeInTheDocument();
    const only = screen.getByText(/Solo con tu cuenta/);
    expect(textNodes(only)).toEqual([' Solo con tu cuenta @ug.uchile.cl']);
    const inside = screen.getByRole('heading', { level: 2, name: 'Qué hay adentro' });
    expect(inside.nextElementSibling).toHaveTextContent('Lo que ya puedes usar con tu cuenta.');
    const first = within(inside.parentElement!).getAllByRole('listitem')[0]!;
    expect(textNodes(first.querySelector('p')!)).toEqual([
      'Cada clase y seminario como una página, con figuras, lo que enfatizó el profe y los errores de las diapositivas corregidos. Escribe «nucléolo» o «GPCR» y llegas directo a la sección, sin importar acentos ni mayúsculas.',
    ]);
    expect(
      screen.getByText(
        'En preparación. Cuando esté listo, aparecerá en tu misma cuenta, sin hacer nada más.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Cómo se usa' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Preguntas frecuentes' }),
    ).toBeInTheDocument();
    expect(screen.getByText('¿Cuesta algo?').nextElementSibling).toHaveTextContent(
      'No. Es gratis.',
    );
  });
});

describe('the frequently asked questions', () => {
  it('the answers with a link keep the words and the spaces around it in their own text nodes', async () => {
    renderApp('/', { session: null });
    const privacy = (await screen.findByText(/^Tu nombre, tu correo y tu foto de Google/)).closest(
      'dd',
    )!;
    expect(textNodes(privacy)).toEqual([
      expect.stringMatching(/^Tu nombre, tu correo y tu foto de Google;.*El detalle está en la$/),
      ' ',
      'política de privacidad',
      '.',
    ]);
    const about = screen.getByText(/^Estudiantes, a partir de las clases/).closest('dd')!;
    expect(textNodes(about)).toEqual([
      expect.stringMatching(/^Estudiantes, a partir de las clases.*cada pieza está en$/),
      ' ',
      'Acerca de',
      '.',
    ]);
    const take = screen.getByText(/^Sí\. Si algo tuyo aparece/).closest('dd')!;
    expect(textNodes(take)).toEqual([
      'Sí. Si algo tuyo aparece en el sitio y quieres que se saque, escribe a',
      ' ',
      expect.stringMatching(/@/),
      ' e indica qué es.',
    ]);
    const enter = screen.getByText(/^Entra con tu cuenta @ug\.uchile\.cl/).closest('dd')!;
    expect(textNodes(enter)).toEqual([
      expect.stringMatching(/^Entra con tu cuenta.*escribe a $/),
      expect.stringMatching(/@/),
      '.',
    ]);
  });
});

describe('the sign-in button and the notices', () => {
  it('while the session is read the page is only a status, and then it shows the sign-in', async () => {
    renderApp('/', { session: null });
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entrar con Google' })).toBeNull();
    expect(await screen.findByRole('button', { name: 'Entrar con Google' })).toBeInTheDocument();
  });

  it('a new attempt takes away the error of the one before, and the error comes before the notice of the URL', async () => {
    const user = userEvent.setup();
    const { session } = renderApp('/?notice=deletion', { session: null });
    expect(await screen.findByText('Tu cuenta se eliminará')).toBeInTheDocument();
    session.signInWithGoogle = async () => {
      throw new Error('red');
    };
    await user.click(await screen.findByRole('button', { name: 'Entrar' }));
    expect(
      await screen.findByText('No se pudo abrir Google. Revisa tu conexión e intenta de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tu cuenta se eliminará')).toBeNull();
    session.signInWithGoogle = () => new Promise(() => undefined);
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(screen.getByRole('button', { name: 'Abriendo Google…' })).toBeDisabled();
    expect(
      screen.queryByText('No se pudo abrir Google. Revisa tu conexión e intenta de nuevo.'),
    ).toBeNull();
    expect(screen.getByText('Tu cuenta se eliminará')).toBeInTheDocument();
  });
});
