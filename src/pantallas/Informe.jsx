// =============================================================================
// Informe ejecutivo
// =============================================================================
//
// Una hoja que se lee en dos minutos y se imprime en una página carta.
//
// Qué es y qué no es
// ------------------
// El texto lo escribe la propia app con reglas fijas sobre tus números. No hay
// nadie interpretando del otro lado: cada frase es una plantilla que se llena
// con cifras calculadas aquí mismo y que SE CALLA cuando no tiene nada que
// decir. Eso tiene una ventaja que ningún texto escrito a mano tiene: no puede
// inventar un dato, porque no sabe inventar. Y tiene un límite honesto: no va a
// notar que el bistec cayó justo la semana que subiste el precio, porque eso no
// está en los datos.
//
// Las tres reglas que hacen que esto se lea y no se hojee
// ------------------------------------------------------
// 1. Ninguna frase sin número, y ningún número sin su comparación. "Las ventas
//    bajaron" no es información. "$19,594 por día, −8.2% contra la semana
//    pasada" sí.
//
// 2. Una frase que no aplica no se escribe en gris ni se pone en cero: se
//    quita. Un informe de siete renglones que todos dicen algo vale más que uno
//    de quince con ocho rellenos.
//
// 3. La corrección de calendario manda. Igual que en el Resumen, lo que se
//    enseña primero es el promedio POR DÍA, no el total — y cuando las dos
//    cifras cuentan historias distintas, el informe lo dice en voz alta en vez
//    de dejar que el total engañe.
//
// El PDF
// ------
// No se genera con una librería: se usa la impresión del navegador con una hoja
// de estilos propia para papel. Eso da texto vectorial de verdad —se puede
// seleccionar y buscar dentro del PDF—, pesa cero kilobytes extra en la app, y
// funciona igual en la Mac y en el iPhone. Una librería tipo html2canvas habría
// metido medio megabyte para producir una imagen borrosa.
//
// Las reglas de @media print viven aquí abajo, en este archivo, y no en el CSS
// global a propósito: solo existen mientras esta pantalla está montada. Así
// imprimir cualquier otra pestaña sigue funcionando como siempre.
// =============================================================================

import { useMemo, useState, useEffect } from 'react';
import {
  totalizar, porTipoDeDia, comparar, diasEntre, diaSemana, nombreDia,
} from '../analisis.js';
import { comparaciones, cuantosDias, estaEnCurso } from '../rango.js';
import { traerProductosRango, traerExtrasRango } from '../datos.js';
import { Delta } from '../graficas.jsx';
import { Imagotipo } from '../marca.jsx';
import {
  C, DISPLAY, tarjeta, nota, pesos, pesosExactos, numero, porciento,
  rangoLegible, fechaLarga, fechaCorta,
} from '../estilo.js';

const n = (x) => (x === null || x === undefined || x === '' ? 0 : +x);

// ─── la hoja de estilos para papel ───────────────────────────────────────────
//
// Dos trabajos distintos. Primero, quitar de en medio lo que es navegación y no
// información: el encabezado negro, las pestañas, el selector de periodo y el
// propio botón de imprimir. Segundo, apretar: en pantalla el aire ayuda a leer,
// en papel el aire es lo que empuja el informe a una segunda página.
//
// Va con !important porque toda la app usa estilos en línea, y en CSS un estilo
// en línea solo lo gana una regla marcada así.
const ESTILO_IMPRESION = `
@media print {
  @page { size: letter portrait; margin: 11mm 12mm; }

  .dc-no-imprimir { display: none !important; }

  html, body { background: #FFFFFF !important; }
  /* Sin esto el navegador tira los fondos y la banda de la marca sale en
     blanco, con el logo blanco encima: invisible. */
  body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .dc-pagina { background: #FFFFFF !important; max-width: none !important;
               min-height: 0 !important; }

  .inf-hoja { padding: 0 !important; }
  .inf-tarjeta {
    break-inside: avoid !important; page-break-inside: avoid !important;
    box-shadow: none !important; border-radius: 5px !important;
    padding: 8px 11px !important; margin-bottom: 6px !important;
  }
  .inf-banda { padding: 8px 11px !important; margin-bottom: 5px !important;
               border-radius: 5px !important; }
  .inf-rejilla { grid-template-columns: 1fr 1fr !important; gap: 5px !important;
                 margin-bottom: 5px !important; }
  .inf-marca { height: 19px !important; }

  .inf-titulo-hoja { font-size: 12.5pt !important; }
  .inf-titulo { font-size: 8.8pt !important; margin-bottom: 3px !important; }
  .inf-cifra { font-size: 13pt !important; }
  .inf-cifras { gap: 8px 16px !important; }

  /* El texto a dos columnas SOLO en papel. En pantalla el ancho de la app ya
     es cómodo y partirlo estorbaría; en una hoja carta es la diferencia entre
     una página y dos, porque el bloque de frases es lo más alto del informe.
     'break-inside: avoid' impide que una frase se parta a la mitad entre una
     columna y la otra, que es lo único que haría esto ilegible. */
  .inf-texto { columns: 2 !important; column-gap: 15px !important; }
  .inf-texto p { font-size: 8.1pt !important; line-height: 1.4 !important;
                 margin-bottom: 4px !important;
                 break-inside: avoid !important; page-break-inside: avoid !important; }

  .inf-tarjeta table { font-size: 7.6pt !important; }
  .inf-tarjeta td, .inf-tarjeta th { padding: 1.8px 8px 1.8px 0 !important; }
  .inf-pie { font-size: 7pt !important; line-height: 1.5 !important; }
}
`;

// ─── piezas ──────────────────────────────────────────────────────────────────

function Tarjeta({ titulo, children, extra }) {
  return (
    <div className="inf-tarjeta" style={tarjeta({ padding: '15px 17px', ...extra })}>
      {titulo && (
        <h3 className="inf-titulo" style={{
          fontFamily: DISPLAY, fontSize: '14px', fontWeight: 600, margin: '0 0 10px',
          color: C.tinta, letterSpacing: '-0.005em',
        }}>{titulo}</h3>
      )}
      {children}
    </div>
  );
}

function Cifra({ etiqueta, valor, delta, pie }) {
  return (
    <div style={{ minWidth: '112px' }}>
      <div style={{ fontSize: '9.5px', color: C.tinta4, textTransform: 'uppercase',
                    letterSpacing: '0.09em', fontWeight: 700, marginBottom: '4px' }}>
        {etiqueta}
      </div>
      <div className="inf-cifra" style={{ fontSize: '23px', fontWeight: 700,
                                          lineHeight: 1.05, letterSpacing: '-0.02em' }}>
        {valor}
      </div>
      {delta !== undefined && (
        <div style={{ fontSize: '11.5px', marginTop: '4px', display: 'flex',
                      alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
          <Delta valor={delta} />
          {pie && <span style={{ color: C.tinta4 }}>{pie}</span>}
        </div>
      )}
    </div>
  );
}

/** Tabla chica, sin adornos: en papel cada píxel de borde cuesta una línea. */
function Tabla({ columnas, filas, clave }) {
  if (!filas.length) {
    return <p style={{ fontSize: '13px', color: C.tinta3 }}>Sin datos en el periodo.</p>;
  }
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '12.5px' }}>
      <thead>
        <tr>
          {columnas.map((c, i) => (
            <th key={c.titulo} style={{
              textAlign: i === 0 ? 'left' : 'right',
              fontSize: '9.5px', fontWeight: 700, color: C.tinta4,
              textTransform: 'uppercase', letterSpacing: '0.07em',
              padding: '4px 9px 4px 0', whiteSpace: 'nowrap',
              borderBottom: `1px solid ${C.lineaFuerte}`,
            }}>{c.titulo}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {filas.map((f, j) => (
          <tr key={clave ? clave(f) : j}>
            {columnas.map((c, i) => (
              <td key={c.titulo} style={{
                textAlign: i === 0 ? 'left' : 'right',
                padding: '4px 9px 4px 0',
                color: i === 0 ? C.tinta : C.tinta2,
                whiteSpace: i === 0 ? 'normal' : 'nowrap',
                fontVariantNumeric: 'tabular-nums',
                borderBottom: `1px solid ${C.linea}`,
              }}>{c.valor(f)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const F = ({ children }) => (
  <p style={{ fontSize: '13.5px', color: C.tinta2, lineHeight: 1.55,
              margin: '0 0 7px' }}>{children}</p>
);
const B = ({ children }) => (
  <b style={{ color: C.tinta, fontWeight: 700 }}>{children}</b>
);

// ─── el texto ────────────────────────────────────────────────────────────────
//
// Cada regla devuelve una frase o no devuelve nada. Están aquí abajo, sueltas y
// con nombre, para que se puedan leer de corrido y se vea exactamente qué
// condición enciende cada una. Si algún día una frase dice una tontería, se
// sabe cuál tocar sin leer la pantalla entera.

function construirFrases(d) {
  const { t, vs, cmp, tipo, mejor, peor, catMovida, extras, enCurso } = d;
  const fr = [];
  // La magnitud va SIN signo, porque el signo ya lo dice el verbo. Escribir
  // "bajó +21.4%" es la clase de error que ninguna prueba de cifras encuentra
  // —el número está bien— y que al leerlo tira la credibilidad de toda la hoja.
  const mag = (x) => `${Math.abs(x).toFixed(1)}%`;
  const sube = (x) => (x > 0 ? 'subió' : 'bajó');
  const suben = (x) => (x > 0 ? 'subieron' : 'bajaron');

  // 1 · El encabezado del movimiento. Siempre sale: es el único renglón que no
  //     depende de que haya con qué comparar.
  fr.push(
    <F key="cabeza">
      En <B>{t.dias} {t.dias === 1 ? 'día' : 'días'}</B> vendiste{' '}
      <B>{pesos(t.ingresos)}</B>, o sea <B>{pesos(t.promedioDia)} por día</B>,
      con <B>{numero(t.recibos)}</B> {t.recibos === 1 ? 'recibo' : 'recibos'} y un
      ticket promedio de <B>{pesos(t.ticket)}</B>.
      {t.ingreso_envio > 0 && <> De ahí, {pesos(t.ingreso_envio)} fueron cobro de envío.</>}
    </F>
  );

  // 2 · Contra qué se compara, con la corrección de calendario por delante.
  if (vs && vs.b.dias > 0 && vs.ingresos.porDia !== null) {
    fr.push(
      <F key="vs">
        Contra {cmp.anterior.nombre} ({rangoLegible(cmp.anterior.desde, cmp.anterior.hasta)}),
        la venta por día <B>{sube(vs.ingresos.porDia)}</B> <B>{mag(vs.ingresos.porDia)}</B>.
        {vs.advertencia === 'signo' && <>
          {' '}Ojo: sumando todo {sube(vs.ingresos.crudo)}{' '}
          {mag(vs.ingresos.crudo)}, lo contrario — esa diferencia
          es el calendario, no el negocio. Este periodo trae{' '}
          {Math.abs(vs.diferenciaDias)} {Math.abs(vs.diferenciaDias) === 1 ? 'día' : 'días'}{' '}
          {vs.diferenciaDias < 0 ? 'menos' : 'más'}.
        </>}
        {vs.advertencia === 'magnitud' && <>
          {' '}El total dice que {sube(vs.ingresos.crudo)} {mag(vs.ingresos.crudo)} porque este periodo
          trae {Math.abs(vs.diferenciaDias)}{' '}
          {Math.abs(vs.diferenciaDias) === 1 ? 'día' : 'días'}{' '}
          {vs.diferenciaDias < 0 ? 'menos' : 'más'}; la cifra por día es la
          que compara peras con peras.
        </>}
      </F>
    );
  }

  // 3 · Cuando los dos periodos no traen los mismos días de la semana, ni el
  //     promedio diario salva la comparación: un domingo no es un lunes.
  if (vs && vs.mismosDias.aplica && vs.mismosDias.pct !== null) {
    fr.push(
      <F key="dow">
        Los dos periodos no traen los mismos días de la semana —este tiene{' '}
        {vs.mismosDias.sinPareja.join(' y ')} y el otro no—, así que comparando{' '}
        <B>solo los días que existen en los dos</B> ({vs.mismosDias.emparejados.join(', ')}),
        el cambio real es <B>{porciento(vs.mismosDias.pct)}</B>.
      </F>
    );
  }

  // 4 · El ticket, descompuesto. Que el ticket suba puede significar dos cosas
  //     opuestas —más gente gastando más, o menos gente gastando lo mismo— y la
  //     diferencia entre las dos es toda la noticia.
  if (vs && vs.ticket.crudo !== null && Math.abs(vs.ticket.crudo) >= 1.5
      && vs.recibos.crudo !== null) {
    const tk = vs.ticket.crudo, rc = vs.recibos.crudo;
    let lectura;
    if (tk > 0 && rc < 0) lectura = 'menos cuentas, pero más grandes cada una';
    else if (tk > 0 && rc >= 0) lectura = 'más cuentas y además más grandes — las dos a favor';
    else if (tk < 0 && rc > 0) lectura = 'más gente, pero gastando menos cada quien';
    else lectura = 'menos cuentas y además más chicas — las dos en contra';
    fr.push(
      <F key="ticket">
        El ticket promedio {sube(tk)} <B>{mag(tk)}</B> hasta{' '}
        <B>{pesos(t.ticket)}</B>, mientras los recibos {suben(rc)}{' '}
        {mag(rc)}: <B>{lectura}</B>.
      </F>
    );
  }

  // 5 · De dónde salió el movimiento, por sección. Es la frase que convierte
  //     "bajó 8%" en algo sobre lo que se puede actuar.
  if (catMovida) {
    fr.push(
      <F key="cat">
        De los <B>{pesos(Math.abs(catMovida.totalDia))} {catMovida.totalDia >= 0 ? 'más' : 'menos'} por día</B>,{' '}
        <B>{pesos(Math.abs(catMovida.deltaDia))}</B> {catMovida.deltaDia >= 0 ? 'vienen' : 'se perdieron'} en{' '}
        <B>{catMovida.categoria}</B> ({pesos(catMovida.basePorDia)} → {pesos(catMovida.ahoraPorDia)} por día).
        {catMovida.contraria && <>
          {' '}En sentido contrario, <B>{catMovida.contraria.categoria}</B>{' '}
          {catMovida.contraria.deltaDia >= 0 ? 'sumó' : 'restó'}{' '}
          {pesos(Math.abs(catMovida.contraria.deltaDia))} por día.
        </>}
      </F>
    );
  }

  // 6 · Fin de semana contra entre semana. En un restaurante son dos negocios
  //     distintos y la proporción entre ellos es lo que decide los turnos.
  if (tipo.diasFuertes > 0 && tipo.diasNormales > 0) {
    fr.push(
      <F key="finde">
        De viernes a domingo se hizo el <B>{tipo.participacionFuerte.toFixed(1)}%</B> de la
        venta en {tipo.diasFuertes} de {t.dias} días: un día fuerte dejó{' '}
        <B>{pesos(tipo.promedioFuerte)}</B> contra {pesos(tipo.promedioNormal)} de
        uno normal, <B>{Math.round((tipo.promedioFuerte / tipo.promedioNormal - 1) * 100)}% más</B>.
      </F>
    );
  }

  // 7 · El mejor y el peor día. Con menos de tres días no dice nada.
  if (mejor && peor && t.dias >= 3 && mejor.fecha !== peor.fecha) {
    fr.push(
      <F key="dias">
        El mejor día fue el <B>{nombreDia(diaSemana(mejor.fecha))} {fechaCorta(mejor.fecha)}</B>{' '}
        con {pesos(n(mejor.ingresos_totales))}; el más flojo, el{' '}
        <B>{nombreDia(diaSemana(peor.fecha))} {fechaCorta(peor.fecha)}</B> con{' '}
        {pesos(n(peor.ingresos_totales))} — <B>{Math.round(
          (n(mejor.ingresos_totales) / Math.max(n(peor.ingresos_totales), 1) - 1) * 100)}%</B>{' '}
        de diferencia entre los dos.
      </F>
    );
  }

  // 8 · Los extras que van dentro del platillo. Van con su advertencia pegada:
  //     ese dinero YA está contado en el precio del platillo, y la primera vez
  //     que alguien lo ve suelto lo suma al total.
  if (extras && extras.porciones > 0) {
    fr.push(
      <F key="extras">
        Dentro de los platillos salieron <B>{numero(extras.porciones)} porciones de extras</B>{' '}
        (bistec, huevos, queso, frijoles, guiso de más)
        {extras.ingreso > 0 && <>, <B>{pesos(extras.ingreso)}</B> estimados
          {t.ingresos > 0 && <> — el {((extras.ingreso / t.ingresos) * 100).toFixed(1)}% de la venta</>}</>}
        . Ese dinero <B>no se suma aparte</B>: ya viaja dentro del precio del
        platillo al que se le puso.
      </F>
    );
  }

  // 9 · El aviso de periodo incompleto va al final, donde se lee como nota al
  //     pie y no como la noticia principal.
  if (enCurso) {
    fr.push(
      <F key="curso">
        <B>Este periodo todavía no termina</B>, así que el total es de lo que
        lleva corrido. Las comparaciones sí están recortadas al mismo tramo.
      </F>
    );
  }

  return fr;
}

// ─── pantalla ────────────────────────────────────────────────────────────────

export default function Informe({ dias, rango, ultimoDato, esAncho, perfil }) {
  const [filas, setFilas] = useState(null);
  const [error, setError] = useState('');

  const cmp = useMemo(() => comparaciones(rango), [rango]);

  useEffect(() => {
    let vivo = true;
    setFilas(null);
    (async () => {
      try {
        const [ahora, antes, extras] = await Promise.all([
          traerProductosRango(rango.desde, rango.hasta),
          traerProductosRango(cmp.anterior.desde, cmp.anterior.hasta),
          // Los extras son un adorno útil, no el esqueleto del informe: si esa
          // función no está instalada todavía, el informe sale igual sin ella.
          traerExtrasRango(rango.desde, rango.hasta).catch(() => []),
        ]);
        if (!vivo) return;
        setFilas({ ahora, antes, extras });
        setError('');
      } catch (e) {
        if (vivo) setError([e.message, e.detalle].filter(Boolean).join(' — '));
      }
    })();
    return () => { vivo = false; };
  }, [rango.desde, rango.hasta, cmp.anterior.desde, cmp.anterior.hasta]);

  const calc = useMemo(() => {
    if (!dias?.length) return null;

    const delRango = diasEntre(dias, rango.desde, rango.hasta);
    const delBase = diasEntre(dias, cmp.anterior.desde, cmp.anterior.hasta);
    const t = totalizar(delRango);
    const vs = comparar(delRango, delBase);
    const tipo = porTipoDeDia(delRango);

    const ordenados = [...delRango].sort(
      (a, b) => n(b.ingresos_totales) - n(a.ingresos_totales));
    const mejor = ordenados[0] || null;
    const peor = ordenados[ordenados.length - 1] || null;

    const diasA = cuantosDias(rango.desde, rango.hasta);
    const diasB = cuantosDias(cmp.anterior.desde, cmp.anterior.hasta);

    let categorias = [], top = [], suben = [], bajan = [], catMovida = null;
    let totalProductos = 0, extras = null;

    if (filas) {
      // El reparto por sección. Se calcula sobre TODO el periodo —nunca sobre
      // algo filtrado— porque es el que tiene que cerrar en 100%.
      const acum = (lista) => {
        const m = new Map();
        for (const f of lista) {
          const k = f.categoria || 'Sin categoría';
          const a = m.get(k) || { categoria: k, unidades: 0, ingresos: 0 };
          a.unidades += n(f.unidades);
          a.ingresos += n(f.ingresos);
          m.set(k, a);
        }
        return m;
      };
      const mAhora = acum(filas.ahora);
      const mAntes = acum(filas.antes);
      totalProductos = [...mAhora.values()].reduce((s, c) => s + c.ingresos, 0);
      categorias = [...mAhora.values()].sort((a, b) => b.ingresos - a.ingresos);

      // Quién movió la aguja. Se compara POR DÍA en los dos lados: si no, un
      // periodo de 7 días contra uno de 7 sería justo pero uno de 5 contra 31
      // diría que todas las secciones se desplomaron.
      if (delBase.length > 0 && diasA > 0 && diasB > 0) {
        const movs = [];
        for (const k of new Set([...mAhora.keys(), ...mAntes.keys()])) {
          const ahoraPorDia = (mAhora.get(k)?.ingresos || 0) / diasA;
          const basePorDia = (mAntes.get(k)?.ingresos || 0) / diasB;
          movs.push({ categoria: k, ahoraPorDia, basePorDia,
                      deltaDia: ahoraPorDia - basePorDia });
        }
        const totalDia = movs.reduce((s, m) => s + m.deltaDia, 0);
        const porPeso = [...movs].sort((a, b) => Math.abs(b.deltaDia) - Math.abs(a.deltaDia));
        const principal = porPeso[0];
        // Solo vale la pena contarlo si el movimiento es de un tamaño que se
        // nota: menos del 2% de la venta diaria es ruido.
        const umbral = Math.max(t.promedioDia * 0.02, 150);
        if (principal && Math.abs(principal.deltaDia) >= umbral) {
          // La sección que se movió fuerte EN CONTRA de la principal, si la hay.
          // Es la que explica por qué el total se movió menos de lo que parece.
          const contraria = porPeso.find(
            (m) => Math.sign(m.deltaDia) !== Math.sign(principal.deltaDia)
              && Math.abs(m.deltaDia) >= umbral) || null;
          catMovida = { ...principal, totalDia, contraria };
        }
      }

      top = [...filas.ahora].sort((a, b) => n(b.ingresos) - n(a.ingresos)).slice(0, 8);

      // Movimiento por producto.
      //
      // Dos decisiones que cambian por completo lo que sale en estas dos listas.
      //
      // El mínimo se escala con el largo del periodo: pedir 20 unidades de base
      // en una semana dejaría fuera medio menú, y pedir 5 en un año llenaría la
      // lista de cosas que casi no existen.
      //
      // Y se ordena por UNIDADES MOVIDAS, no por porcentaje. Ordenar por
      // porcentaje llenaba la lista de "Salsa Verde, de 7 a 1, −86%": cierto,
      // irrelevante, y empujaba fuera de la hoja a las gorditas moviéndose 150
      // unidades. En un informe de una página lo que importa es el tamaño del
      // movimiento, no su proporción; el porcentaje sigue en la columna de la
      // derecha para quien quiera leerlo.
      const minimo = Math.max(10, Math.round(diasB * 2));
      const factor = diasB / diasA;
      const mapaAntes = new Map(filas.antes.map((f) => [f.producto, f]));
      const mapaAhora = new Map(filas.ahora.map((f) => [f.producto, f]));
      const movidos = [];
      for (const [producto, b] of mapaAntes) {
        const base = n(b.unidades);
        if (base < minimo) continue;
        const u = n(mapaAhora.get(producto)?.unidades);
        const cambio = Math.round((((u * factor) - base) / base) * 1000) / 10;
        if (cambio === 0) continue;
        movidos.push({ producto, base, unidades: u, cambio,
                       // Cuánto se movió de verdad, ya puesto a la misma escala
                       // que el periodo de comparación.
                       movidas: (u * factor) - base,
                       ingresos: n(mapaAhora.get(producto)?.ingresos) });
      }
      suben = movidos.filter((m) => m.cambio > 0)
        .sort((a, b) => b.movidas - a.movidas).slice(0, 5);
      bajan = movidos.filter((m) => m.cambio < 0)
        .sort((a, b) => a.movidas - b.movidas).slice(0, 5);

      // La consulta trae dos niveles en la misma respuesta: lo que se enseña
      // (pertenece_a nulo) y el desglose de adentro de cada grupo. Sumar los
      // dos contaría cada porción dos veces. Y los marcados como guiso mal
      // etiquetado se apartan: ahí 'extra' es el relleno, no un extra.
      const reales = (filas.extras || [])
        .filter((f) => !f.pertenece_a && !f.es_guiso_mal_etiquetado);
      extras = {
        porciones: reales.reduce((s, f) => s + n(f.porciones), 0),
        ingreso: reales.reduce((s, f) => s + n(f.ingreso_estimado), 0),
      };
    }

    const d = {
      t, vs, cmp, tipo, mejor, peor, catMovida, extras,
      enCurso: estaEnCurso(rango, ultimoDato),
      categorias, top, suben, bajan, totalProductos, diasA, diasB,
      hayBase: delBase.length > 0,
    };
    return { ...d, frases: construirFrases(d) };
  }, [dias, rango, ultimoDato, cmp, filas]);

  if (!calc) {
    return <div style={{ padding: '18px', color: C.tinta3 }}>Cargando…</div>;
  }

  const hoy = new Date();
  const generado = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${
    String(hoy.getDate()).padStart(2, '0')}`;

  return (
    <div className="inf-hoja" style={{ padding: '18px',
                paddingBottom: 'calc(44px + env(safe-area-inset-bottom))' }}>
      <style>{ESTILO_IMPRESION}</style>

      {/* ── el botón, que no se imprime a sí mismo ── */}
      <div className="dc-no-imprimir" style={{ display: 'flex', gap: '12px',
                    alignItems: 'center', flexWrap: 'wrap', marginBottom: '14px' }}>
        <button id="inf-imprimir" onClick={() => window.print()}
          style={{ background: C.naranja, color: 'white', border: 'none',
                   borderRadius: '12px', padding: '12px 20px', fontSize: '15px',
                   fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                   minHeight: '46px',
                   boxShadow: '0 2px 8px -2px rgba(237,107,31,.45)' }}>
          Descargar en PDF
        </button>
        <span style={{ fontSize: '12.5px', color: C.tinta3, lineHeight: 1.5,
                       flex: 1, minWidth: '240px' }}>
          Se abre el cuadro de impresión: elige <b>Guardar como PDF</b>. En
          iPhone, el botón <b>Compartir → Imprimir → Guardar en Archivos</b>.
        </span>
      </div>

      {error && (
        <div className="dc-no-imprimir" style={nota('aviso')}>
          No se pudieron traer los productos del periodo, así que el informe sale
          sin el reparto por sección ni los rankings. Las cifras de arriba sí son
          correctas.
          <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: '12px',
                        marginTop: '8px', wordBreak: 'break-word' }}>{error}</div>
        </div>
      )}

      {/* ── la banda de marca. Va oscura porque el logo es blanco: sobre papel
             claro no se vería. De paso le da al informe cara de documento y no
             de captura de pantalla. ── */}
      <div className="inf-banda" style={{
        background: `linear-gradient(135deg, ${C.negro} 0%, ${C.cacao} 150%)`,
        borderRadius: '14px', padding: '16px 20px', marginBottom: '14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: '16px', flexWrap: 'wrap', color: '#FFF6F0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
          <Imagotipo alto={30} className="inf-marca" />
          <div style={{ borderLeft: `1px solid ${C.negroSuave}`, paddingLeft: '13px' }}>
            <div className="inf-titulo-hoja" style={{ fontFamily: DISPLAY, fontSize: '19px',
                          fontWeight: 600, letterSpacing: '-0.01em' }}>
              Informe ejecutivo
            </div>
            <div style={{ fontSize: '12px', color: C.durazno, marginTop: '2px' }}>
              {rangoLegible(rango.desde, rango.hasta)}
            </div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '11px', color: C.durazno,
                      lineHeight: 1.5 }}>
          <div>Generado el {fechaLarga(generado)}</div>
          <div>Datos hasta el {fechaLarga(ultimoDato)}</div>
          {perfil?.nombre && <div>{perfil.nombre}</div>}
        </div>
      </div>

      {/* ── las cuatro cifras ── */}
      <Tarjeta>
        <div id="inf-cifras" className="inf-cifras"
             style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 22px' }}>
          <Cifra etiqueta="Venta por día" valor={pesos(calc.t.promedioDia)}
                 delta={calc.hayBase ? calc.vs.ingresos.porDia : undefined}
                 pie={`vs ${calc.cmp.anterior.nombre}`} />
          <Cifra etiqueta="Venta total" valor={pesos(calc.t.ingresos)}
                 delta={calc.hayBase ? calc.vs.ingresos.crudo : undefined}
                 pie={`en ${calc.t.dias} ${calc.t.dias === 1 ? 'día' : 'días'}`} />
          <Cifra etiqueta="Recibos" valor={numero(calc.t.recibos)}
                 delta={calc.hayBase ? calc.vs.recibos.porDia : undefined}
                 pie="por día" />
          <Cifra etiqueta="Ticket promedio" valor={pesos(calc.t.ticket)}
                 delta={calc.hayBase ? calc.vs.ticket.crudo : undefined} />
          <Cifra etiqueta="Unidades" valor={numero(calc.t.unidades)}
                 delta={calc.hayBase ? calc.vs.unidades.porDia : undefined}
                 pie="por día" />
        </div>
      </Tarjeta>

      {/* ── el texto ── */}
      <Tarjeta titulo="Qué pasó en el periodo">
        <div className="inf-texto" id="inf-texto">{calc.frases}</div>
      </Tarjeta>

      {/* ── las dos tablas ── */}
      <div className="inf-rejilla" style={{
        display: 'grid',
        gridTemplateColumns: esAncho ? '1fr 1fr' : '1fr',
        gap: '14px', alignItems: 'start', marginBottom: '14px',
      }}>
        <Tarjeta titulo="Reparto por sección">
          <Tabla clave={(f) => f.categoria} filas={calc.categorias} columnas={[
            { titulo: 'Sección', valor: (f) => f.categoria },
            { titulo: 'Unidades', valor: (f) => numero(f.unidades) },
            { titulo: 'Ingresos', valor: (f) => pesos(f.ingresos) },
            { titulo: '%', valor: (f) => calc.totalProductos
                ? `${((f.ingresos / calc.totalProductos) * 100).toFixed(1)}%` : '—' },
          ]} />
        </Tarjeta>

        <Tarjeta titulo="Los que más dejaron">
          <Tabla clave={(f) => f.producto} filas={calc.top} columnas={[
            { titulo: 'Producto', valor: (f) => f.producto },
            { titulo: 'Unidades', valor: (f) => numero(f.unidades) },
            { titulo: 'Ingresos', valor: (f) => pesos(f.ingresos) },
          ]} />
        </Tarjeta>
      </div>

      {calc.hayBase && (calc.suben.length > 0 || calc.bajan.length > 0) && (
        <div className="inf-rejilla" style={{
          display: 'grid',
          gridTemplateColumns: esAncho ? '1fr 1fr' : '1fr',
          gap: '14px', alignItems: 'start', marginBottom: '14px',
        }}>
          <Tarjeta titulo="Subieron">
            <Tabla clave={(f) => f.producto} filas={calc.suben} columnas={[
              { titulo: 'Producto', valor: (f) => f.producto },
              { titulo: 'Unidades', valor: (f) => `${numero(f.base)} → ${numero(f.unidades)}` },
              { titulo: 'Cambio', valor: (f) => <Delta valor={f.cambio} decimales={0} /> },
            ]} />
          </Tarjeta>
          <Tarjeta titulo="Bajaron">
            <Tabla clave={(f) => f.producto} filas={calc.bajan} columnas={[
              { titulo: 'Producto', valor: (f) => f.producto },
              { titulo: 'Unidades', valor: (f) => `${numero(f.base)} → ${numero(f.unidades)}` },
              { titulo: 'Cambio', valor: (f) => <Delta valor={f.cambio} decimales={0} /> },
            ]} />
          </Tarjeta>
        </div>
      )}

      <p className="inf-pie" style={{ fontSize: '11px', color: C.tinta4,
                   lineHeight: 1.6, marginTop: '4px' }}>
        Don Comal · Datos. Las cifras son las mismas del tablero y se recalculan
        cada vez que se abre esta hoja. Las comparaciones por día corrigen la
        diferencia en el número de días entre los dos periodos; el reparto por
        sección y los rankings no incluyen el cobro de envío. Los montos de
        extras son estimados y ya están contenidos en el precio del platillo.
        {calc.suben.length + calc.bajan.length > 0 && <>
          {' '}Las listas de movimiento van ordenadas por unidades movidas, no
          por porcentaje, y para entrar un producto necesita al menos{' '}
          {Math.max(10, Math.round(calc.diasB * 2))} unidades vendidas en el
          periodo de comparación.
        </>}
      </p>
    </div>
  );
}
