// Builds the "Fungerar notiserna?" checklist from plain facts (testable without a phone).
const KNOWN_KILLERS = /samsung|oneplus|oppo|xiaomi|huawei|honor|realme|vivo/i;
const day = (d) => d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', timeZone: 'Europe/Stockholm' });

/**
 * facts: from notificationFacts(); battery: {unrestricted, manufacturer} | null;
 * hasToday: whether today has (real or estimated) prayer times.
 * Returns [{ id, ok, text, note?, action? }] where action is an id the UI maps to a button.
 */
export function healthItems(facts, battery, hasToday) {
  const android = facts.platform === 'android';
  const items = [{
    id: 'display', ok: facts.display,
    text: facts.display ? 'Notiser är tillåtna' : 'Notiser är avstängda för appen – du får inga bönenotiser.',
    action: android ? 'notification-settings' : null,
  }];
  if (android) {
    items.push({
      id: 'exact', ok: facts.exact !== false,
      text: facts.exact !== false ? 'Exakta alarm är tillåtna' : 'Utan exakta alarm kan notiserna komma flera minuter sent.',
      action: 'exact-alarms',
    });
  }
  if (battery) {
    const extra = KNOWN_KILLERS.test(battery.manufacturer ?? '')
      ? ` På ${battery.manufacturer} finns ibland även en egen inställning för appar i bakgrunden.` : '';
    items.push({
      id: 'battery', ok: !!battery.unrestricted,
      text: battery.unrestricted
        ? 'Batterioptimering är avstängd för appen'
        : `Telefonen kan pausa appen för att spara batteri, så notiser kan utebli. Välj "Obegränsad" eller "Tillåt".${extra}`,
      action: 'battery-settings',
    });
  }
  items.push({
    id: 'schedule', ok: hasToday,
    text: hasToday ? 'Det finns tider för idag' : 'Inget schema för den här månaden – inga bönenotiser skickas.',
    action: 'add-schedule',
  });
  const until = facts.last ? ` till och med ${day(facts.last)}` : '';
  items.push({
    id: 'pending', ok: facts.pending > 0,
    text: facts.pending > 0
      ? (facts.platform === 'ios' ? `${facts.pending} av ${facts.limit} notiser inlagda${until}` : `${facts.pending} notiser inlagda${until}`)
      : 'Inga kommande notiser är inlagda.',
    note: facts.platform === 'ios' ? 'iPhone tillåter max 64 – öppna appen minst en gång i veckan så fylls de på.' : null,
  });
  return items;
}
