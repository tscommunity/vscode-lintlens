const containerType = {
    "root": 0,
    "object": 1,
    "array": 2
};

function isMultipleItems(schema) {
    if (Array.isArray(schema) && schema.length > 1) {
        return true;
    }
    if (schema.hasOwnProperty('type')
        && schema.type === 'array'
        && schema.hasOwnProperty('items')
        && schema.items.length > 1
    ) {
        return true;
    }

    return false;
}

function getIndent(count) {
    return '  '.repeat(count);
}

function getConstantText(text) {
    if (typeof text === 'string') {
        return `"${text}"`;
    }
    return text;
}

function getRef(schema, ref) {
    // path
    if (ref.includes('/')) {
        try {
            const path = ref.split('/');
            // remove first entry ('#')
            path.shift();
            let current = schema;
            for (let i = 0; i < path.length; i++) {
                current = current[path[i]];
            }
            return current;
        } catch (err) {
            return {};
        }
    }

    // identifier
    try {
        const id = ref;
        // remove # character
        definition.shift();
        return Object.values(schema.definitions).find(def => def.$id === id) || {};
    } catch (err) {
        return {};
    }
}

function getStandardArrayDoc({ schema, root, indent, parentType }) {
    if (parentType === containerType.array) {
        return getStandardArrayBodyDoc({ schema, root, indent, parentType });
    }

    let ret = '[\n';

    ret += `${getIndent(indent + 1)}${getStandardArrayBodyDoc({ schema, root, indent: indent + 1, parentType: containerType.array })}\n`;

    ret += `${getIndent(indent)}]`;

    return ret;
}

function getStandardArrayBodyDoc({ schema, root, indent, parentType }) {
    return schema.map(item => {
        return getSchemaDoc({ schema: item, root, indent, parentType });
    }).join(`,\n${getIndent(indent)}`);
}

function getNullDoc() {
    return '<null />';
}

function getMultiTypeDoc({ schema }) {
    let ret = '(';

    ret += schema.type.map(type => `<${type} />`).join(' | ');

    if (schema.hasOwnProperty('default')) {
        ret += ` (default: ${schema.default})`;
    }

    ret += ')';

    return ret;
}

function getEnumDoc({ schema }) {
    if (schema.enum.length === 1) {
        return getConstantText(schema.enum[0]);
    }

    let ret = '< ';

    // TODO: consider static(ish) newlines - so I can maintain indent

    ret += schema.enum.map(item => {
        return getConstantText(item);
    }).join(' | ');

    if (schema.hasOwnProperty('default')) {
        ret += ` (default: ${getConstantText(schema.default)})`;
    }

    ret += ' />';

    return ret;
}

function getObjectDoc({ schema, root, indent }) {
    //TODO: dependencies
    // Property dependencies (value of a dependency is array): declare that certain other properties must be present if a given property is present.
    // Schema dependencies (value of a dependency is object): declare that the schema changes when a given property is present.

    //TODO: propertyNames
    // propertyNames
    //  (validates the name of the properties - assumes type: string)
    //     minLength
    //     maxLength
    //     pattern (regex)

    let ret = '{\n';

    if (schema.hasOwnProperty('properties')) {
        const required = schema.required || [];
        const items = Object.entries(schema.properties).map(([key, value]) => {
            //TODO: rethink how to indicate required properties
            return `${getIndent(indent + 1)}${required.includes(key) ? '(required) ' : ''}"${key}": ${getSchemaDoc({ schema: value, root, indent: indent + 1, parentType: containerType.object })}`;
        });
        ret += `${items.join(',\n')}\n`;
    }

    if (schema.hasOwnProperty('patternProperties')) {
        const items = Object.entries(schema.patternProperties).map(([key, value]) => {
            return `${getIndent(indent + 1)}[/${key}/]: ${getSchemaDoc({ schema: value, root, indent: indent + 1, parentType: containerType.object })}`;
        });
        ret += `${items.join(',\n')}\n`;
    }

    if (schema.hasOwnProperty('additionalProperties')) {
        if (typeof schema.additionalProperties === 'boolean') {
            if (schema.additionalProperties === true) {
                ret += `${getIndent(indent + 1)}...<any>\n`;
            }
        } else {
            ret += `${getIndent(indent + 1)}...[<any>]: ${getSchemaDoc({ schema: schema.additionalProperties, root, indent: indent + 1, parentType: containerType.object })}\n`;
        }
    }

    if (schema.hasOwnProperty('minProperties')) {
        ret += `${getIndent(indent + 1)}# min properties: ${schema.minProperties}\n`;
    }

    if (schema.hasOwnProperty('maxProperties')) {
        ret += `${getIndent(indent + 1)}# max properties: ${schema.maxProperties}\n`;
    }

    ret += `${getIndent(indent)}}`;

    return ret;
}

function getArrayDoc({ schema, root, indent, parentType }) {
    if (parentType === containerType.array) {
        const arr = getArrayBodyDoc(({ schema, root, indent, parentType }));
        return arr;
    }

    let ret = '[\n';

    ret += `${getIndent(indent + 1)}${getArrayBodyDoc({ schema, root, indent: indent + 1, parentType })}\n`;

    ret += `${getIndent(indent)}]`;

    return ret;
}

function getArrayBodyDoc({ schema, root, indent }) {
    let ret = '';
    let itemCount = null;

    if (schema.hasOwnProperty('items') || schema.hasOwnProperty('contains')) {
        const items = schema.contains || schema.items;
        if (schema.hasOwnProperty('contains')) {
            ret += `(contains)\n${getIndent(indent)}`;
        }
        if (Array.isArray(items)) {
            if (!schema.hasOwnProperty('contains')) {
                itemCount = items.length;
            }

            ret += items.map(item => {
                return getSchemaDoc({ schema: item, root, indent, parentType: containerType.array });
            }).join(`,\n${getIndent(indent)}`);
        } else {
            ret += `...${getSchemaDoc({ schema: items, root, indent, parentType: containerType.array })}`;
        }
    }

    if (schema.hasOwnProperty('additionalItems')) {
        itemCount = null;
        if (typeof schema.additionalItems === 'boolean') {
            if (schema.additionalItems === true) {
                ret += `\n${getIndent(indent)}...<any>`;
            }
        } else {
            ret += `\n${getIndent(indent)}...${getSchemaDoc({ schema: schema.additionalItems, root, indent, parentType: containerType.array })}`;
        }
    }

    if (itemCount !== 1) {
        //TODO: infer:  min = 0, max = item count --> optional
        if (schema.hasOwnProperty('minItems')) {
            ret += `\n${getIndent(indent)}# min items: ${schema.minItems}`;
        }
    
        if (schema.hasOwnProperty('maxItems')) {
            ret += `\n${getIndent(indent)}# max items: ${schema.maxItems}`;
        }
    
        if (schema.hasOwnProperty('uniqueItems')) {
            ret += `\n${getIndent(indent)}# unique: ${schema.uniqueItems}`;
        }
    }

    return ret;
}

function getStringDoc({ schema }) {
    let ret = '<string';

    const mods = [];
    if (schema.hasOwnProperty('minLength') || schema.hasOwnProperty('maxLength')) {
        let mod = `length: `;

        if (!schema.hasOwnProperty('minLength')) {
            mod += `≤ ${schema.maxLength}`;
        } else if (!schema.hasOwnProperty('maxLength')) {
            mod += `≥ ${schema.minLength}`;
        } else {
            mod += `${schema.minLength} to ${schema.maxLength}`;
        }

        mods.push(mod);
    }

    if (schema.hasOwnProperty('pattern')) {
        mods.push(`regex: /${schema.pattern}/`);
    }

    if (schema.hasOwnProperty('default')) {
        mods.push(`default: "${schema.default}"`);
    }

    if (mods.length > 0) {
        ret += ' (';
        ret += mods.join(', ');
        ret += ')';
    }

    ret += ' />';

    return ret;
}

function getNumericDoc({ schema }) {
    let ret = `<${schema.type}`;

    const mods = [];
    if (schema.hasOwnProperty('minimum') || schema.hasOwnProperty('exclusiveMinimum') || schema.hasOwnProperty('maximum') || schema.hasOwnProperty('exclusiveMaximum')) {
        if (schema.hasOwnProperty('minimum')) {
            mods.push(`x ≥ ${schema.minimum}`);
        } else if (schema.hasOwnProperty('exclusiveMinimum')) {
            mods.push(`x > ${schema.exclusiveMinimum}`);
        }

        if (schema.hasOwnProperty('maximum')) {
            mods.push(`x ≤ ${schema.maximum}`);
        } else if (schema.hasOwnProperty('exclusiveMaximum')) {
            mods.push(`x < ${schema.exclusiveMaximum}`);
        }
    }

    if (schema.hasOwnProperty('multipleOf')) {
        mods.push(`multiple of: ${schema.multipleOf}`);
    }

    if (schema.hasOwnProperty('default')) {
        mods.push(`default: ${schema.default}`);
    }

    if (mods.length > 0) {
        ret += ' (';
        ret += mods.join(', ');
        ret += ')';
    }

    ret += ' />';

    return ret;
}

function getBooleanDoc({ schema }) {
    if (schema.hasOwnProperty('default')) {
        return `<boolean (default: ${schema.default}) />`;
    }
    return '<boolean />';
}

function getConstDoc({ schema }) {
    return getConstantText(schema.const);
}

function getOneOfDoc({ schema, root, indent, parentType }) {
    const { oneOf: of, ...rest } = schema;

    const items = of.map((item) => {
        return {
            ...rest,
            ...item
        };
    });
    return getOfDoc({ label: 'one', items, root, indent, parentType });
}

function getAnyOfDoc({ schema, root, indent, parentType }) {
    const { anyOf: of, ...rest } = schema;

    const items = of.map((item) => {
        return {
            ...rest,
            ...item
        };
    });
    return getOfDoc({ label: 'any', items, root, indent, parentType });
}

function getAllOfDoc({ schema, root, indent, parentType }) {
    const { allOf: of, ...rest } = schema;

    const items = of.map((item) => {
        return {
            ...rest,
            ...item
        };
    });
    return getOfDoc({ label: 'all', items, root, indent, parentType });
}

function getOfDoc({ label, items, root, indent, parentType }) {
    if (items.length === 1) {
        return getSchemaDoc({ schema: items[0], root, indent, parentType });
    }

    let ret = `<${label} of:\n`;

    ret += items.map(item => {
        let itemRet = '';
        let hasMultipleItems = isMultipleItems(item);
        let newIndent = indent + (hasMultipleItems ? 1 : 0);

        if (hasMultipleItems) {
            itemRet += `${getIndent(newIndent)}(\n`;
        }

        itemRet += `${getIndent(newIndent + 1)}${getSchemaDoc({ schema: item, root, indent: newIndent + 1, parentType })}`;

        if (hasMultipleItems) {
            itemRet += `\n${getIndent(newIndent)})`;
        }

        return itemRet;
    }).join(',\n');

    ret += `\n${getIndent(indent)}/>`;

    return ret;
}

function getNotDoc({ schema, root, indent, parentType }) {
    let ret = '<not:\n';

    const { not, ...rest } = schema;

    ret += `${getIndent(indent + 1)}${getSchemaDoc({ schema: { ...rest, ...not }, root, indent: indent + 1, parentType })}\n`;

    ret += `${getIndent(indent)}/>`;

    return ret;
}

function getIfThenElseDoc({ schema, root, indent, parentType }) {
    let ret = `if (${getSchemaDoc({ schema: schema.if, root, indent, parentType })})`;
    ret += `\n${getIndent(indent + 1)}then ${getSchemaDoc({ schema: schema.then, root, indent: indent + 1, parentType })})`;
    if (schema.hasOwnProperty('else')) {
        ret += `\n${getIndent(indent + 1)}else ${getSchemaDoc({ schema: schema.else, root, indent: indent + 1, parentType })})`;
    }

    return ret;
}

function getSchemaDoc({ schema, root = schema, indent = 0, parentType = containerType.root }) {
    let item = schema;
    if (schema.hasOwnProperty('$ref') && item.$ref[0] === '#') {
        item = getRef(root, item.$ref);
    }

    if (Array.isArray(item)) {
        if (item.length === 1) {
            item = item[0];
        } else {
            return getStandardArrayDoc(({ schema: item, root, indent, parentType }));
        }
    }

    if (item.hasOwnProperty('not')) {
        return getNotDoc(({ schema: item, root, indent, parentType }));
    }

    if (item.hasOwnProperty('const')) {
        return getConstDoc(({ schema: item, root, indent, parentType }));
    }

    if (Array.isArray(item.type)) {
        if (item.type.length === 2 && item.type.includes('null')) {
            item = {
                oneOf: [
                    {
                        ...item,
                        type: item.type.find(i => i !== 'null')
                    },
                    { type: "null" }
                ]
            };
        } else {
            return getMultiTypeDoc(({ schema: item, root, indent, parentType }));
        }
    }

    if (item.hasOwnProperty('type') && item.type === "null") {
        return getNullDoc(({ schema: item, root, indent, parentType }));
    }

    if (item.hasOwnProperty('type') && item.type === "object") {
        return getObjectDoc(({ schema: item, root, indent, parentType }));
    }
    //TODO: improve this (what if not "properties", but other things?)
    if (!item.hasOwnProperty('type') && item.hasOwnProperty('properties')) {
        return getObjectDoc(({ schema: item, root, indent, parentType }));
    }

    if (item.hasOwnProperty('type') && item.type === "array") {
        return getArrayDoc(({ schema: item, root, indent, parentType }));
    }
    //TODO: improve this (what if not "items", but other things?)
    if (!item.hasOwnProperty('type') && item.hasOwnProperty('items')) {
        return getArrayDoc(({ schema: item, root, indent, parentType }));
    }

    if (item.hasOwnProperty('enum')) {
        return getEnumDoc(({ schema: item, root, indent, parentType }));
    }
    if (item.hasOwnProperty('type') && item.type === "string") {
        return getStringDoc(({ schema: item, root, indent, parentType }));
    }
    if (item.hasOwnProperty('type') && ['integer', 'number'].includes(item.type)) {
        return getNumericDoc(({ schema: item, root, indent, parentType }));
    }
    if (item.hasOwnProperty('type') && item.type === "boolean") {
        return getBooleanDoc(({ schema: item, root, indent, parentType }));
    }

    if (item.hasOwnProperty('oneOf')) {
        return getOneOfDoc(({ schema: item, root, indent, parentType }));
    }
    if (item.hasOwnProperty('anyOf')) {
        return getAnyOfDoc(({ schema: item, root, indent, parentType }));
    }
    if (item.hasOwnProperty('allOf')) {
        return getAllOfDoc(({ schema: item, root, indent, parentType }));
    }

    if (item.hasOwnProperty('if') && item.hasOwnProperty('then')) {
        return getIfThenElseDoc(({ schema: item, root, indent, parentType }));
    }

    return '';
}


export function getSchemaDocumentation(schemaConfig) {
    const standardOptionsEnum = {
        enum: ["off", 0, "warn", 1, "error", 2]
    };

    if (schemaConfig && (schemaConfig.length || Object.entries(schemaConfig).length)) {
        const eslintRuleOption = [ standardOptionsEnum, schemaConfig ];
        return getStandardArrayDoc({ schema: eslintRuleOption, root: schemaConfig, indent: 0, parentType: containerType.root });
    }

    return getEnumDoc({ schema: standardOptionsEnum, root: schemaConfig, indent: 0 });
}





/*
type (can be an array of these or a single value)
    string
        minLength
        maxLength
        pattern (regex)
        default

    number | integer
        multipleOf
        minimum
        maximum
        exclusiveMinimum
        exclusiveMaximum
        default

    object
        properties
        required (array of property names)
        propertyNames (validates the name of the properties)
            minLength
            maxLength
            pattern (regex)
        minProperties
        maxProperties
        dependencies (object:
            if property with the name <key> is included,
            then a property with the name <value> is required
        )

    array (elements CAN be anything at all, but usually have these things)
        minItems
        maxItems
        uniqueItems

        a)
            items (an object like any other schema object)
            contains (where items says all items must be this, contains says at least one must be this)

        b)
            items (an array of schema objects)
            additionalItems (boolean - in addition to the list in items, are others allowed)

    boolean
        default


other things (can be at any level)
    allOf
        value must be valid against all of these things (schema objects)
    anyOf
        value can be valid against any of these things (schema objects)
    oneOf
        value must be valid against exactly one of these things (schema objects)
    not
        value must NOT be valid against this thing (schema object)

    definitions
    $ref (points to definition)

    const
        a constant value

    default

    if/then/else
        if (valid against this thing)
        then (use this thing (schema object))
        else (use this thing (schema object))
*/

/*
Rules for a get*Doc() function:
    * never start with a newline
    * never end with a newline
    * never start with an indent
    * when a newline is used within, indent based on parent’s indent
*/
