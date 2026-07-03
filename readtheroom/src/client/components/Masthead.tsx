type MastheadProps = {
  day: number;
  date: string;
  players?: number;
};

const formatDate = (date: string): string => {
  const d = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const Masthead = ({ day, date, players }: MastheadProps) => (
  <header className="rtr-masthead">
    <div className="rtr-eyebrow">The Daily Consensus</div>
    <h1 className="rtr-masthead-title">
      Read the <em>Room</em>
    </h1>
    <hr className="rtr-rule" />
    <hr className="rtr-rule rtr-rule--thin" />
    <div className="rtr-dateline">
      <span>No. {day}</span>
      <span>{formatDate(date)}</span>
      <span>
        {players !== undefined
          ? `${players} read${players === 1 ? '' : 's'} today`
          : 'One guess a day'}
      </span>
    </div>
  </header>
);
