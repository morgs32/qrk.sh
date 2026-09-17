# @zerospin/zod

Convert Zerospin `IShape` descriptors to Zod object schemas.

```ts
import { primitives } from '@zerospin/schema';
import { makeZodSchema } from '@zerospin/zod';
import { z } from 'zod';

const User = makeZodSchema({
  id: primitives.primaryKey({ abbreviation: 'usr' }),
  name: primitives.text(),
});

type IUser = z.infer<typeof User>;
User.parse({ id: 'usr_abc', name: 'Ada' });
```
