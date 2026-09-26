interface Props {
  headerPresent: boolean;
}

export default function ResearchOnlyBanner({ headerPresent }: Props) {
  if (headerPresent) {
    return (
      <div className="research-banner ok">
        Research-only controls active.
      </div>
    );
  }

  return (
    <div className="research-banner warn">
      Research-only response header is missing. Treat this run as unverified research output.
    </div>
  );
}
