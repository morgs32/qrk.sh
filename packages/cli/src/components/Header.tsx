import { createRequire } from 'node:module';

import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';

const require = createRequire(import.meta.url);
const banner = (
  require('cfonts') as {
    render: (text: string, options: { font: string }) => { string: string };
  }
).render('Zerospin', { font: 'simple' }).string;

export const Header = () => {
  return (
    <Box marginBottom={1}>
      <Gradient name="rainbow">
        <Text>{banner}</Text>
      </Gradient>
    </Box>
  );
};
