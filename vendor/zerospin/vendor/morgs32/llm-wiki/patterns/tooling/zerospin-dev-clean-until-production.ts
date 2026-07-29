/**
 * Reset local-only model schemas to 1.0.0 and start development from a clean Zerospin generation until production is deployed.
 *
 * @bad Do not retain local migration history while local development explicitly recreates its generation.
 * @bad Do not run `zerospin dev` without `--clean` during the local-only reset period.
 */
const developmentCommand = "zerospin dev --clean";

const localModelVersion = "1.0.0";

void developmentCommand;
void localModelVersion;
