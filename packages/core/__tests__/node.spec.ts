import {
  createNode,
  FormKitGroupValue,
  FormKitPlugin,
  FormKitNode,
  bfs,
  resetCount,
} from '../src/node'
import { createConfig } from '../src/config'
import {
  createNameTree,
  createTicketTree,
  createShippingTree,
  phoneMask,
  eventCounter,
} from '../../../.jest/helpers'
import { generateClassList } from '../src/classes'
import { jest } from '@jest/globals'
import { FormKitMiddleware } from '../src/dispatcher'
import { has } from '@formkit/utils'

describe('node', () => {
  it('defaults to a text node', () => {
    const node = createNode()
    expect(node.type).toBe('input')
  })

  it('emits a singe commit event for type input', () => {
    const commitEvent = jest.fn()
    const countEmits = function (node: FormKitNode) {
      node.on('commit', commitEvent)
    }
    const node = createNode({ value: '', plugins: [countEmits] })
    expect(commitEvent).toHaveBeenCalledTimes(0)
    node.input(['a', 'b'], false)
    expect(commitEvent).toHaveBeenCalledTimes(1)
  })

  it('emits a singe commit event for type list', () => {
    const commitEvent = jest.fn()
    const lib = function libraryPlugin() {}
    lib.library = (node: FormKitNode) => {
      if (node.props.type === 'list') {
        node.define({ type: 'list' })
      } else if (node.props.type === 'group') {
        node.define({ type: 'group' })
      } else {
        node.define({ type: 'input' })
      }
    }
    const node = createNode({
      props: { type: 'list' },
      plugins: [lib],
    })
    node.on('commit', commitEvent)
    const parentA = createNode({ props: { type: 'group' }, parent: node })
    const parentB = createNode({ props: { type: 'group' }, parent: node })
    const parentC = createNode({ props: { type: 'group' }, parent: node })
    createNode({
      name: 'a',
      props: { type: 'text' },
      parent: parentA,
      value: undefined,
    })
    createNode({
      name: 'b',
      props: { type: 'text' },
      parent: parentB,
      value: undefined,
    })
    createNode({
      name: 'c',
      props: { type: 'text' },
      parent: parentC,
      value: undefined,
    })
    expect(commitEvent).toHaveBeenCalledTimes(3)
    node.input([{}, {}, {}], false)
    expect(commitEvent).toHaveBeenCalledTimes(7)
  })

  it('allows configuration to flow to children', () => {
    const email = createNode({ name: 'email' })
    const node = createNode({
      type: 'group',
      config: {
        delimiter: '#',
      },
      children: [email],
    })
    expect(email.config.delimiter).toBe('#')
    node.config.delimiter = '$'
    expect(email.config.delimiter).toBe('$')
  })

  it('allows config to be overriden by child props', () => {
    const child = createNode({
      props: {
        flavor: 'cherry',
      },
    })
    createNode({
      type: 'group',
      config: {
        size: 'large',
        flavor: 'grape',
      },
      children: [child],
    })
    expect(child.props.size).toBe('large')
    expect(child.props.flavor).toBe('cherry')
  })

  it('emits config:{property} events when configuration options change', () => {
    const node = createNode({
      config: { locale: 'en' },
      type: 'group',
      children: [createNode({ name: 'child' })],
    })
    const listenerA = jest.fn()
    const listenerB = jest.fn()
    node.on('config:locale', listenerA)
    node.at('child')!.on('config:locale', listenerB)
    node.config.locale = 'fr'
    expect(listenerA).toHaveBeenCalledTimes(1)
    expect(listenerA).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: 'fr' })
    )
    expect(listenerB).toHaveBeenCalledTimes(1)
    expect(listenerB).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: 'fr' })
    )
    node.remove(node.at('child')!)
    node.config.locale = 'zh'
    expect(listenerA).toHaveBeenCalledTimes(2)
    expect(listenerB).toHaveBeenCalledTimes(1)
  })

  it('does not emit config:{property} events when ancestors defines its own local value', () => {
    const node = createNode({
      // config: { locale: 'en' },
      type: 'group',
      children: [
        createNode({
          type: 'list',
          name: 'list',
          config: {
            locale: 'fr',
          },
          children: [createNode()],
        }),
      ],
    })
    const listenerA = jest.fn()
    const listenerB = jest.fn()
    expect(node.at('list')?.props.locale).toBe('fr')
    expect(node.at('list.0')!.props.locale).toBe('fr')
    node.at('list')!.on('config:locale', listenerA)
    node.at('list.0')!.on('config:locale', listenerB)
    node.config.locale = 'zh'
    expect(node.props.locale).toBe('zh')
    expect(node.at('list')!.props.locale).toBe('fr')
    expect(node.at('list.0')!.props.locale).toBe('fr')
    expect(listenerA).toHaveBeenCalledTimes(0)
    expect(listenerB).toHaveBeenCalledTimes(0)
  })

  it('can traverse into lists and groups', () => {
    const group = createNode({
      type: 'group',
      children: [
        createNode({ name: 'team' }),
        createNode({
          type: 'list',
          name: 'users',
          children: [
            createNode({
              type: 'group',
              children: [
                createNode({ name: 'email' }),
                createNode({ name: 'password' }),
              ],
            }),
            createNode({
              type: 'group',
              children: [
                createNode({ name: 'email' }),
                createNode({ name: 'password', value: 'foobar' }),
              ],
            }),
          ],
        }),
      ],
    })
    expect(group.at('users.1.password')?.value).toBe('foobar')
  })

  it('only traverses one layer deep when calling node.each', () => {
    const tree = createNode({
      type: 'group',
      children: [
        createNode(),
        createNode(),
        createNode({ type: 'group', children: [createNode(), createNode()] }),
      ],
    })
    const callback = jest.fn()
    tree.each(callback)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  it('traverses any depth when calling node.walk', () => {
    const tree = createNode({
      type: 'group',
      children: [
        createNode(),
        createNode(),
        createNode({ type: 'group', children: [createNode(), createNode()] }),
      ],
    })
    const callback = jest.fn()
    tree.walk(callback)
    expect(callback).toHaveBeenCalledTimes(5)
  })

  it('does not allow nodes of type input to be created with children', () => {
    expect(() => {
      createNode({ children: [createNode()] })
    }).toThrow()
  })

  it('does not allow the same child multiple times', () => {
    const email = createNode({ name: 'email' })
    const parent = createNode({ name: 'parent', type: 'group' })
    parent.add(email)
    parent.add(email)
    expect(parent.children.length).toBe(1)
  })

  it('changes a child’s config when moving between trees', () => {
    const email = createNode({ name: 'email' })
    createNode({
      type: 'group',
      config: {
        delimiter: '#',
      },
      children: [email],
    })
    const parentB = createNode({
      type: 'group',
      config: {
        delimiter: '|',
      },
    })
    parentB.add(email)
    expect(email.config.delimiter).toBe('|')
  })

  it('can use rootConfig values, and listen to events', () => {
    const rootConfig = createConfig({
      foo: 'bar',
    })
    const group = createNode({
      name: 'group',
      type: 'group',
      config: {
        rootConfig,
      },
      children: [createNode({ name: 'child', config: { rootConfig } })],
    })
    const listener = jest.fn()
    expect(group.config.foo).toBe('bar')
    expect(group.at('child')?.props.foo).toBe('bar')
    group.at('child')!.on('prop:foo', listener)
    rootConfig.foo = 'baz'
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: 'baz' })
    )
  })

  it('always has an __FKNode__ trap property', () => {
    const node = createNode()
    expect(node.__FKNode__).toBe(true)
  })

  it('allows instantiation with children and sets the parent', () => {
    const group = createNode({
      type: 'group',
      children: [createNode()],
    })
    expect(group.children.length).toBe(1)
    expect(group.children.values().next().value.parent).toBe(group)
  })

  it('allows instantiation and later adding of a child', () => {
    const group = createNode({ type: 'group' })
    const element = createNode()
    group.add(element)
    expect(group.children.values().next().value).toBe(element)
    expect(element.parent).toBe(group)
  })

  it('can remove a child from a parent', () => {
    const group = createNode({ type: 'group' })
    const el = createNode()
    const el2 = createNode()
    group.add(el).add(el2)
    group.remove(el)
    expect(group.children.length).toBe(1)
    expect(el.parent).toBeNull()
  })

  it('allows a node to be moved between parents', () => {
    const el = createNode()
    const groupA = createNode({
      type: 'group',
      children: [createNode(), el],
    })
    const groupB = createNode({
      type: 'group',
      children: [createNode()],
    })
    groupB.add(el)
    expect(groupA.children.length).toBe(1)
    expect(groupB.children.length).toBe(2)
    expect(groupB.children.includes(el)).toBeTruthy()
    expect(el.parent).toBe(groupB)
  })

  it('allows a node to be moved by changing the parent', () => {
    const el = createNode()
    const groupA = createNode({
      type: 'group',
      children: [createNode(), el],
    })
    const groupB = createNode({
      type: 'group',
      children: [createNode()],
    })
    el.parent = groupB
    expect(groupA.children.length).toBe(1)
    expect(groupB.children.length).toBe(2)
    expect(groupB.children.includes(el)).toBeTruthy()
    expect(el.parent).toBe(groupB)
  })

  it('allows a node to be created with a parent', () => {
    const parent = createNode({ children: [createNode()], type: 'list' })
    const child = createNode({ parent })
    expect(parent.children.length).toBe(2)
    expect(child.parent).toBe(parent)
  })

  it('can get a node’s index', () => {
    const item = createNode()
    createNode({
      type: 'list',
      children: [createNode(), createNode(), item, createNode()],
    })
    expect(item.index).toBe(2)
  })

  it('allows changing a node’s index by directly assigning it', () => {
    const moveMe = createNode()
    const parent = createNode({
      type: 'list',
      children: [createNode(), createNode(), moveMe, createNode()],
    })
    moveMe.index = 1
    let children = [...parent.children]
    expect(children[1]).toBe(moveMe)
    moveMe.index = 3
    children = [...parent.children]
    expect(children[3]).toBe(moveMe)
    moveMe.index = -1
    children = [...parent.children]
    expect(children[0]).toBe(moveMe)
    moveMe.index = 99
    children = [...parent.children]
    expect(children[3]).toBe(moveMe)
  })

  it('can always reference the root', () => {
    const nestedChild = createNode()
    const parent = createNode({ type: 'group' })
    const L1 = createNode({
      type: 'list',
      children: [
        createNode({}),
        createNode({}),
        createNode({
          type: 'list',
          children: [nestedChild],
        }),
      ],
    })
    parent.add(L1)
    expect(nestedChild.root).toBe(parent)
  })

  it('automatically uses index names for list children', () => {
    const parent = createNode({
      type: 'list',
      children: [createNode({ name: 'howdy' })],
    })
    expect(parent.at('howdy')).toBeFalsy()
  })

  it('uses prop type as prefix for children', () => {
    const node = createNode({ type: 'input', props: { type: 'select' } })
    expect(/select_\d+/.test(node.name)).toBe(true)
  })

  it('can fetch a nested node’s address', () => {
    const email = createNode({ name: 'email' })
    createNode({
      name: 'form',
      type: 'group',
      children: [
        createNode({ name: 'input1' }),
        createNode({
          name: 'input2',
          type: 'list',
          children: [
            createNode(),
            createNode({
              type: 'group',
              children: [email],
            }),
            createNode(),
          ],
        }),
        createNode({ name: 'input3' }),
      ],
    })
    expect(email.address).toEqual(['form', 'input2', 1, 'email'])
    const parent2 = createNode({ name: 'differentForm', type: 'group' })
    parent2.add(email)
    expect(email.address).toEqual(['differentForm', 'email'])
  })

  it('allows node traversal using path', () => {
    const instagram = createNode({ name: 'instagram' })
    const password = createNode({ name: 'password' })
    const parent = createNode({
      name: 'form',
      type: 'group',
      children: [
        createNode({ name: 'username' }),
        password,
        createNode({
          name: 'social',
          type: 'list',
          children: [
            createNode({
              type: 'group',
              children: [
                createNode({ name: 'twit' }),
                instagram,
                createNode({ name: 'face' }),
              ],
            }),
            createNode({
              type: 'group',
              children: [
                createNode({ name: 'twit' }),
                createNode({ name: 'instagram', value: 456 }),
                createNode({ name: 'face' }),
              ],
            }),
          ],
        }),
        createNode({ name: 'submit' }),
      ],
    })
    expect(parent.at('social.0.instagram')).toBe(instagram)
    expect(parent.at('form.social.0.instagram')).toBe(instagram)
    expect(parent.at(['password'])).toBe(password)
    expect(parent.at(['social', 1, 'instagram'])?.value).toBe(456)
    expect(parent.at(instagram.address)).toBe(instagram)
  })

  it('uses the $root keyword to allow root access via address', () => {
    const [parent, nestedChild] = createTicketTree()
    expect(nestedChild.at('$root')).toBe(parent)
  })

  it('uses the $parent keyword to allow address backtracking', () => {
    const [, nestedChild] = createTicketTree()
    const price = nestedChild.at('$parent.$parent.0.price')
    expect(price).toBeDefined()
    expect(price?.value).toBe(499)
  })

  it('removes the first $parent of any address', () => {
    const [root] = createTicketTree()
    const email = root.at('email')
    expect(email?.at('$parent.password')).toBe(email?.at('password'))
  })

  it('can reference $self and $self children', () => {
    const [root] = createTicketTree()
    const tickets = root.at('tickets')
    expect(tickets?.at('$self.0.price')?.value).toBe(499)
  })

  it('can find a node in a subtree by name', () => {
    const [root, nestedChild] = createTicketTree()
    expect(root.find('seat')).toBe(nestedChild)
  })

  it('can find a node in a subtree by name via address', () => {
    const [root, nestedChild] = createTicketTree()
    expect(root.at(['find(seat)'])).toBe(nestedChild)
  })

  it('can find a node in a subtree by type', () => {
    const [root, nestedChild] = createTicketTree()
    const row = nestedChild.at('$parent.$parent.find(555, value)')
    expect(row).toBeTruthy()
    expect(row).toBe(root.at('tickets.0.row'))
  })
})

describe('props system', () => {
  it('can set arbitrary initial prop values', () => {
    resetCount()
    const node = createNode({ props: { party: 'town', pizza: 'yummy' } })
    expect(node.props.pizza).toBe('yummy')
    expect(node.props).toEqual({
      id: 'input_0',
      party: 'town',
      pizza: 'yummy',
    })
    expect(node.props.delay).toBe(20)
  })

  it('configuration values flow to props', () => {
    const child = createNode({ name: 'name' })
    createNode({
      config: { arbitrary: 't' },
      type: 'group',
      children: [child],
    })
    expect(child.props.arbitrary).toBe('t')
  })

  it('props can override default props', () => {
    const child = createNode({
      name: 'name',
      props: {
        delay: 50,
      },
    })
    createNode({
      type: 'group',
      children: [child],
    })
    expect(child.props.delay).toBe(50)
  })

  it('can override a configuration value', () => {
    const child = createNode({ name: 'name', props: { delay: 500 } })
    createNode({
      config: { delay: 400 },
      type: 'group',
      children: [child],
    })
    expect(child.props.delay).toBe(500)
  })

  it('can override a configuration value with the prop hook', () => {
    const child = createNode({ name: 'name', props: { delay: 500 } })
    createNode({
      config: { delay: 400 },
      type: 'group',
      children: [child],
    })
    child.hook.prop(({ prop }, next) => next({ prop, value: 800 }))
    child.props.delay = 200
    expect(child.props.delay).toBe(800)
  })

  it('emits a prop event when a config changes and there is no matching prop', () => {
    const listener = jest.fn()
    const node = createNode({
      props: {},
      config: { foo: 'bar' },
    })
    node.on('prop:foo', listener)
    node.config.foo = 'baz'
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('emits a prop event when a prop changes', () => {
    const node = createNode({
      props: {
        name: 'ted',
      },
    })
    const listener = jest.fn()
    node.on('prop', listener)
    node.props.name = 'fred'
    expect(listener).toHaveBeenCalledWith({
      name: 'prop',
      bubble: true,
      origin: node,
      payload: {
        prop: 'name',
        value: 'fred',
      },
    })
  })
})

describe('plugin system', () => {
  it('runs plugins on node creation', () => {
    const plugin = jest.fn(() => {})
    const node = createNode({
      plugins: [plugin],
    })
    expect(plugin).toHaveBeenLastCalledWith(node)
  })

  it('automatically inherits from parent plugins', () => {
    const pluginA = jest.fn(() => {})
    const pluginB = jest.fn(() => {})
    const parent = createNode({
      type: 'group',
      plugins: [pluginA],
    })
    const child = createNode({
      parent,
      plugins: [pluginB],
    })
    expect(pluginB).toBeCalledTimes(1)
    expect(pluginA).toBeCalledTimes(2)
    expect(pluginB).toHaveBeenCalledWith(child)
    expect(pluginA).toHaveBeenNthCalledWith(2, child)
  })

  it('runs inherited plugins when being added to a tree', () => {
    const pluginA = jest.fn(() => {})
    const pluginB = jest.fn(() => {})
    createNode({
      type: 'list',
      plugins: [pluginA],
      children: [
        createNode(),
        createNode({ plugins: [pluginB] }),
        createNode(),
      ],
    })
    expect(pluginA).toBeCalledTimes(4)
    expect(pluginB).toBeCalledTimes(1)
  })

  it('inherits the plugins when moving between trees', () => {
    const pluginA = jest.fn(() => {})
    const pluginB = jest.fn(() => {})
    const treeA = createNode({
      type: 'group',
      plugins: [pluginA],
    })
    const treeB = createNode({
      type: 'group',
      plugins: [pluginB],
    })
    const child = createNode({ parent: treeA })
    expect(pluginA).toHaveBeenCalledTimes(2)
    child.parent = treeB
    expect(pluginB).toHaveBeenCalledTimes(2)
    expect(child.plugins).toEqual(new Set([pluginA, pluginB]))
  })

  it('does not re-run plugins when moving position in tree', () => {
    const pluginA = jest.fn(() => {})
    const child = createNode()
    const treeA = createNode({
      type: 'group',
      plugins: [pluginA],
      children: [
        createNode(),
        createNode({
          name: 'group',
          type: 'group',
          children: [createNode()],
        }),
        child,
      ],
    })
    expect(pluginA).toHaveBeenCalledTimes(5)
    treeA.at('group')?.add(child)
    expect(pluginA).toHaveBeenCalledTimes(5)
  })

  it('throws an exception if you try to manually change the plugins', () => {
    const node = createNode()
    expect(() => {
      node.plugins = new Set()
    }).toThrow()
  })

  it('propagates initial values to parents', async () => {
    const parent = createNode({
      type: 'list',
      children: [createNode({ value: 'hi' }), createNode({ value: 'there' })],
    })
    expect(await parent.settled).toEqual(['hi', 'there'])
  })
})

describe('init hook', () => {
  it('can modify a node on created', async () => {
    const envPlugin: FormKitPlugin = function (node) {
      node.on('created', (event) => {
        const payload = event.payload as FormKitNode
        if (payload.type === 'input') payload.input(123)
      })
    }
    const form = createNode({
      type: 'group',
      plugins: [envPlugin],
    })
    const input = createNode({ parent: form, value: 0 })
    expect(input.value).toBe(0)
    expect(input.isSettled).toBeFalsy()
    expect(await input.settled).toBe(123)
  })
})

describe('input hook', () => {
  it('can set the value of a node', async () => {
    const node = createNode({ value: 'hello pluto' })
    node.input('hello world')
    expect(node.value).toBe('hello pluto')
    expect(node.isSettled).toBeFalsy()
    await node.settled
    expect(node.value).toBe('hello world')
  })

  it('resolves the settled to the new value', async () => {
    const node = createNode({ value: 'hello pluto' })
    node.input('hello wo')
    node.input('hello wor')
    expect(node.value).toBe('hello pluto')
    expect(node.isSettled).toBeFalsy()
    node.input('hello world')
    expect(await node.settled).toBe('hello world')
  })

  it('can modify the value being set with the input hook', async () => {
    const node = createNode({ value: 'hello pluto' })
    node.hook.input((value, next) => next(`${value}!`))
    node.input('hello wo')
    node.input('hello wor')
    await node.settled
    expect(node.value).toBe('hello wor!')
  })
})

describe('classes hook', () => {
  it('can change the value being assigned', async () => {
    const themeMiddleware: FormKitMiddleware<{
      property: string
      classes: Record<string, boolean>
    }> = jest.fn((obj, next) => {
      obj.classes.foo = true
      obj.classes.bar = false
      return next(obj)
    })
    const themePlugin: FormKitPlugin = function (node) {
      node.hook.classes(themeMiddleware)
    }
    const phone = createNode({ plugins: [themePlugin] })
    expect(generateClassList(phone, 'label', { bar: true })).toBe('foo')
    expect(themeMiddleware).toHaveBeenCalledTimes(1)
    expect(
      /(foo|baz) (foo|baz)/.test(
        generateClassList(phone, 'label', { bar: true, baz: true })!
      )
    ).toBe(true)
    expect(themeMiddleware).toHaveBeenCalledTimes(2)
  })
})

describe('commit hook', () => {
  it('can change the value being assigned', async () => {
    const commitMiddleware: FormKitMiddleware<string> = jest.fn(phoneMask)
    const phonePlugin: FormKitPlugin = function (node) {
      if (node.type === 'input') {
        node.hook.commit(commitMiddleware)
      }
    }
    phonePlugin.library = (node) => node.define({ type: 'input', schema: [] })
    const phone = createNode({ plugins: [phonePlugin] })
    phone.input('23')
    phone.input('233')
    phone.input('233.662')
    phone.input('233.6621244')
    await phone.settled
    expect(commitMiddleware).toHaveBeenCalledTimes(1)
    expect(phone.value).toBe('(233) 662-1244')
  })
})

describe('value propagation in a node tree', () => {
  it('disturbs parents when a leaf receives input', async () => {
    const field = createNode({ value: '' })
    const tree = createNode({
      type: 'group',
      children: [
        createNode(),
        createNode({ type: 'group' }),
        createNode({ type: 'group', children: [createNode(), field] }),
        createNode(),
      ],
    })
    field.input('abc')
    expect(tree.isSettled).toBe(false)
    await field.settled
    expect(tree.isSettled).toBe(true)
  })

  it('does not settle a tree when multiple leafs are disturbed and one resolves', async () => {
    const fieldA = createNode({ value: '' })
    const fieldB = createNode({ value: '', props: { delay: 100 } })
    const tree = createNode({
      type: 'group',
      children: [
        createNode(),
        createNode({ type: 'group', children: [fieldB] }),
        createNode({ type: 'group', children: [createNode(), fieldA] }),
        createNode(),
      ],
    })
    fieldA.input('abc')
    fieldB.input('def')
    await fieldA.settled
    expect(tree.isSettled).toBe(false)
    await fieldB.settled
    expect(tree.isSettled).toBe(true)
  })

  it('settles a tree when the disturbed input parent is changed', async () => {
    const fieldA = createNode({ value: 123 })
    const treeA = createNode({
      type: 'group',
      name: 'treeA',
      children: [fieldA],
    })
    const treeB = createNode({ type: 'group', name: 'treeB' })
    fieldA.input(456)
    expect(treeA.isSettled).toBe(false)
    fieldA.parent = treeB
    expect(treeA.isSettled).toBe(true)
    expect(treeB.isSettled).toBe(false)
    await fieldA.settled
    expect(treeB.isSettled).toBe(true)
  })

  it('settles a tree when the disturbed input is added to a different tree', async () => {
    const fieldA = createNode({ value: 123 })
    const treeA = createNode({
      type: 'group',
      children: [fieldA],
    })
    const treeB = createNode({ type: 'group' })
    fieldA.input(456)
    expect(treeA.isSettled).toBe(false)
    treeB.add(fieldA)
    expect(treeA.isSettled).toBe(true)
    expect(treeB.isSettled).toBe(false)
    await fieldA.settled
    expect(treeB.isSettled).toBe(true)
  })

  it('collects values from a groups children', async () => {
    const parent = createNode({ type: 'group' })
    const commitMiddleware: FormKitMiddleware<FormKitGroupValue> = jest.fn(
      (value, next) => next(value)
    )
    parent.hook.commit(commitMiddleware)
    const email = createNode({ name: 'email', props: { delay: 100 } })
    const username = createNode({ name: 'username' })
    parent.add(email).add(username)
    email.input('tes')
    email.input('test')
    email.input('test@exam')
    email.input('test@example.com')
    username.input('test-user')
    await username.settled
    expect(commitMiddleware).toHaveBeenCalledTimes(3) // 2 partials, 1 full commit
    expect(parent.value).toEqual({ email: undefined, username: 'test-user' })
    await email.settled
    expect(parent.value).toEqual({
      email: 'test@example.com',
      username: 'test-user',
    })
    expect(commitMiddleware).toHaveBeenCalledTimes(4)
  })

  it('collects values from a list of children', async () => {
    const parent = createNode({
      type: 'list',
      children: [
        createNode(),
        createNode({ props: { delay: 100 } }),
        createNode(),
      ],
    })
    const commitMiddleware: FormKitMiddleware<FormKitGroupValue> = jest.fn(
      (value, next) => next(value)
    )
    parent.hook.commit(commitMiddleware)
    parent.at('0')?.input('hello')
    parent.at('1')?.input('my')
    parent.at('2')?.input('friend')
    await parent.settled
    expect(parent.value).toEqual(['hello', 'my', 'friend'])
    parent.at([1])?.input('daniel’s')
    await parent.settled
    expect(parent.value).toEqual(['hello', 'daniel’s', 'friend'])
  })

  it('collects values from n-depth trees', async () => {
    const shipping = createShippingTree()
    expect(shipping.value).toStrictEqual({
      name: undefined,
      address: {
        street: '694 Boise St',
        city: undefined,
        state: undefined,
        zip: undefined,
      },
      products: [
        {
          product: 'T-shirt',
          price: 2199,
        },
        {
          product: 'Pants',
          price: 5429,
        },
      ],
    })
    shipping.at('address.state')?.input('Virginia')
    expect(shipping.at('address')?.value).toEqual({
      street: '694 Boise St',
      city: undefined,
      state: undefined,
      zip: undefined,
    })
    await shipping.settled
    expect(shipping.value).toStrictEqual({
      name: undefined,
      address: {
        street: '694 Boise St',
        city: undefined,
        state: 'Virginia',
        zip: undefined,
      },
      products: [
        {
          product: 'T-shirt',
          price: 2199,
        },
        {
          product: 'Pants',
          price: 5429,
        },
      ],
    })
  })

  it('can remove a child from the list’s values', async () => {
    const food = createNode({
      type: 'list',
      children: [
        createNode({ value: 'pizza' }),
        createNode({ value: 'pasta' }),
        createNode({ value: 'steak' }),
        createNode({ value: 'fish' }),
      ],
    })
    food.remove(food.at([2])!)
    expect(food.children.length).toBe(3)
    expect(food.isSettled).toBe(true)
    expect(food.value).toStrictEqual(['pizza', 'pasta', 'fish'])
  })

  it('can remove a child from a group’s values', async () => {
    const address = createNode({
      type: 'group',
      children: [
        createNode({ name: 'street', value: '810 Foster Rd' }),
        createNode({ name: 'city', value: 'Boston' }),
        createNode({ name: 'state', value: 'MA' }),
        createNode({ name: 'zip', value: 2101 }),
      ],
    })
    address.remove(address.at('state')!)
    expect(address.children.length).toBe(3)
    expect(address.isSettled).toBe(true)
    expect(address.value).toStrictEqual({
      street: '810 Foster Rd',
      city: 'Boston',
      zip: 2101,
    })
  })

  it('can re-arrange the order of a list’s values', async () => {
    const food = createNode({
      type: 'list',
      children: [
        createNode({ value: 'pizza' }),
        createNode({ value: 'pasta' }),
        createNode({ value: 'steak' }),
        createNode({ value: 'fish' }),
      ],
    })
    const steak = food.at([2])!
    steak.index = 1
    expect(food.value).toStrictEqual(['pizza', 'steak', 'pasta', 'fish'])
    steak.input('ribeye')
    expect(await food.settled).toStrictEqual([
      'pizza',
      'ribeye',
      'pasta',
      'fish',
    ])
  })

  it('moves values from one tree to another', () => {
    const ring = createNode({ name: 'ring', value: 'golden' })
    const form = createNode({ name: 'form', type: 'group' })
    const treeA = createNode({
      name: 'treeA',
      type: 'group',
      children: [createNode({ name: 'person', value: 'joe' })],
    })
    ring.parent = treeA
    expect(treeA.value).toStrictEqual({ person: 'joe', ring: 'golden' })
    form.add(treeA)
    expect(form.value).toStrictEqual({
      treeA: {
        person: 'joe',
        ring: 'golden',
      },
    })
    const treeB = createNode({
      name: 'treeB',
      type: 'group',
      children: [createNode({ name: 'person', value: 'jane' })],
    })
    treeB.parent = form
    treeB.add(ring)
    expect(treeA.value).toStrictEqual({ person: 'joe' })
    expect(treeB.value).toStrictEqual({ person: 'jane', ring: 'golden' })
    expect(form.value).toStrictEqual({
      treeA: {
        person: 'joe',
      },
      treeB: {
        person: 'jane',
        ring: 'golden',
      },
    })
  })

  it('can set values of children by calling input on parent', async () => {
    const tree = createNode({
      type: 'group',
      name: 'form',
      children: [
        createNode({ name: 'a' }),
        createNode({
          name: 'b',
          type: 'group',
          children: [createNode({ name: 'd', value: 456 })],
        }),
        createNode({ name: 'c', value: 123 }),
      ],
    })
    const value = await tree.input({
      a: 123,
      b: {
        d: 789,
        e: '10',
      },
      c: 456,
    })
    expect(value).toEqual({
      a: 123,
      b: {
        d: 789,
        e: '10',
      },
      c: 456,
    })
    expect(tree.at('form.b.d')?.value).toBe(789)
  })

  it('passes initial values through the input middleware', () => {
    const maskPlugin: FormKitPlugin = jest.fn((n) => {
      n.hook.input(phoneMask)
      // n.hook.init(phoneMask)
    })
    const node = createNode({
      value: '5552348899',
      plugins: [maskPlugin],
    })
    expect(node.value).toEqual('(555) 234-8899')
  })

  it('manipulating a subtree produces minimal commit events', () => {
    const plugin = eventCounter('commit')
    const form = createNode({
      plugins: [plugin],
      type: 'group',
      name: 'form',
    })
    expect(plugin.calls).toBe(0)
    form.add(createNode({ name: 'letters', type: 'group', value: { a: 123 } }))
    expect(plugin.calls).toBe(1)
    form.at('letters')!.add(createNode({ name: 'a', value: 456 }))
    expect(plugin.calls).toBe(2)
    expect(form._d).toBe(0)
  })

  it('can catch children being created with the deep modifier', () => {
    const group = createNode({ type: 'group' })
    let log = ''
    group.on('created.deep', ({ payload: child }) => {
      log = child.name
    })
    createNode({ parent: group, name: 'party-town-usa' })
    expect(log).toBe('party-town-usa')
  })

  it('retains parent values when children do not match', () => {
    const treeA = createNode({
      type: 'group',
      value: {
        a: 123,
        b: { d: 456 },
        c: 789,
      },
    })
    const treeB = createNode({
      type: 'group',
      children: [
        createNode({
          name: 'b',
          type: 'group',
          children: [createNode({ name: 'd', value: 555 })],
        }),
      ],
    })
    treeB.at('b')!.parent = treeA
    expect(treeA.value).toStrictEqual({
      a: 123,
      b: { d: 456 },
      c: 789,
    })
    expect(treeA.at('b.d')!.value).toBe(456)
  })

  it('can hydrate a list at depth', () => {
    const tree = createNode({
      type: 'group',
      name: 'form',
      value: {
        a: 'foo',
        people: ['first', 'second', 'third'],
      },
      children: [
        createNode({ name: 'a' }),
        createNode({
          name: 'people',
          type: 'list',
          children: [
            createNode(),
            createNode({ value: 'fifth' }),
            createNode(),
          ],
        }),
      ],
    })
    expect(tree.value).toStrictEqual({
      a: 'foo',
      people: ['first', 'second', 'third'],
    })
    expect(tree.at('people.0')!.value).toBe('first')
    expect(tree.at('people.1')!.value).toBe('second')
    expect(tree.at('people.2')!.value).toBe('third')
  })

  it('can hydrate a pre-existing tree with values', async () => {
    const [tree] = createTicketTree()
    await tree.input({
      email: 'hello@useformkit.com',
      password: 'super-secret',
      tickets: [{ price: 5000, row: 'backstage' }, { price: 200 }],
    })
    expect(tree.at('email')!.value).toBe('hello@useformkit.com')
    expect(tree.at('password')!.value).toBe('super-secret')
    expect(tree.at('tickets.0.price')!.value).toBe(5000)
    expect(tree.at('tickets.0.row')!.value).toBe('backstage')
    expect(tree.at('tickets.1.price')!.value).toBe(200)
    expect(tree.at('tickets.1.seat')!.value).toBe(undefined)
    expect(tree.value).toStrictEqual({
      email: 'hello@useformkit.com',
      password: 'super-secret',
      confirm_password: undefined,
      tickets: [
        { price: 5000, row: 'backstage' },
        { price: 200, seat: undefined },
      ],
    })
  })

  describe('bfs', () => {
    it('searches the parent node first', () => {
      const parent = createNameTree()
      expect(bfs(parent, 'tommy')).toBe(parent)
    })

    it('searches for a name in the children', () => {
      const parent = createNameTree()
      expect(bfs(parent, 'wendy')).toBe(parent.at('wendy'))
    })

    it('allows changing the searched property', () => {
      const parent = createNameTree()
      expect(bfs(parent, '555', 'value')).toBe(parent.at('jane'))
    })

    it('allows a callback to determine the search parameters', () => {
      const parent = createNameTree()
      expect(
        bfs(
          parent,
          'radio',
          (node) => node.name !== 'jane' && node.value === '555'
        )
      ).toBe(parent.at('stella.tommy'))
    })

    it('returns undefined when unable to find a match', () => {
      const parent = createNameTree()
      expect(bfs(parent, 'jim')).toBe(undefined)
    })

    it('searches the entire tree', () => {
      const parent = createNameTree()
      const searcher = jest.fn(() => false)
      bfs(parent, 'jim', searcher)
      expect(searcher.mock.calls.length).toBe(7)
    })
  })

  describe('text hook', () => {
    it('can pass a string of text directly through core with no modifications', () => {
      const node = createNode()
      expect(node.t('hello world')).toBe('hello world')
    })

    it('can modify a string of text', () => {
      const node = createNode()
      type Translations = 'hello'
      const map: Record<Translations, string> = { hello: 'ciao' }
      node.hook.text((frag, next) => {
        if (has(map, frag.key)) {
          frag.value = map[frag.key as Translations]
        }
        return next(frag)
      })
      expect(node.t('justin')).toBe('justin')
      expect(node.t('hello')).toBe('ciao')
    })
  })

  describe('destroyed', () => {
    it('can destroy an element', () => {
      const parent = createNameTree()
      parent.at('jane')?.destroy()
      expect(parent.value).toEqual({
        billy: undefined,
        stella: {
          tommy: '555',
          wendy: undefined,
        },
        wendy: undefined,
      })
    })
  })
})

describe('resetting', () => {
  it('can reset a simple text value', async () => {
    const node = createNode({ value: 'foobar' })
    await node.input('biz bar')
    expect(node.value).toBe('biz bar')
    node.reset()
    expect(node.value).toBe('foobar')
  })

  it('can reset a group value', async () => {
    const node = createNode({
      type: 'group',
      children: [createNode({ name: 'alpha', value: 'abc' })],
    })
    await node.at('alpha')?.input('foobar')
    expect(node.value).toStrictEqual({ alpha: 'foobar' })
    node.reset()
    expect(node.value).toEqual({ alpha: 'abc' })
  })
})
