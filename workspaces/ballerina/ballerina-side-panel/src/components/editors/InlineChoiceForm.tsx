/**
 * Copyright (c) 2026, WSO2 LLC. (https://www.wso2.com) All Rights Reserved.
 *
 * WSO2 LLC. licenses this file to you under the Apache License,
 * Version 2.0 (the "License"); you may not use this file except
 * in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import React, { useEffect, useState } from "react";

import { Dropdown, RadioButtonGroup, TextField } from "@wso2/ui-toolkit";

import { FormField } from "../Form/types";
import { useFormContext } from "../../context";
import styled from "@emotion/styled";
import { getPrimaryInputType, PropertyModel, RecordTypeField } from "@wso2/ballerina-core";
import { FieldFactory } from "./FieldFactory";

interface InlineChoiceFormProps {
    field: FormField;
    recordTypeFields?: RecordTypeField[];
}

const Form = styled.div`
    display: grid;
    gap: 20px;
    width: 100%;
`;

const FormSection = styled.div`
    display: grid;
    gap: 20px;
    width: 100%;
`;

const InlineRow = styled.div`
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
`;

const InlineLabel = styled.span`
    white-space: nowrap;
`;

const InlineWidgetContainer = styled.div`
    flex: 1;
    min-width: 0;
`;

/**
 * InlineChoiceForm - "Advanced Radio Button" component.
 *
 * Each radio option renders an inline widget (dropdown, textbox, etc.) next to
 * its label.  The first property of each choice determines the inline widget;
 * remaining properties are rendered below the radio group when the choice is
 * selected.
 *
 * For a SINGLE_SELECT inline widget whose PropertyModel carries nested
 * `properties` keyed by item value, changing the dropdown selection also
 * renders the matching nested config fields (typically read-only) below.
 */
export function InlineChoiceForm(props: InlineChoiceFormProps) {
    const { field, recordTypeFields } = props;
    const { form } = useFormContext();
    const { setValue, clearErrors } = form;

    // selectedOption is 1-indexed (same convention as ChoiceForm)
    // Initialize from field.value (0-indexed from backend) or find first enabled choice
    const getInitialSelection = (): number => {
        if (field.value !== undefined && field.value !== "") {
            return Number(field.value) + 1;
        }
        const enabledIdx = field.choices.findIndex(choice => choice.enabled);
        return enabledIdx !== -1 ? enabledIdx + 1 : 1;
    };
    const [selectedOption, setSelectedOption] = useState<number>(getInitialSelection);
    // Track the inline widget value for each choice (keyed by choice index)
    const [inlineValues, setInlineValues] = useState<{ [index: number]: string }>({});
    // Dynamic fields rendered below the radio group
    const [dynamicFields, setDynamicFields] = useState<FormField[]>([]);

    // On mount / choices change, select first enabled choice
    useEffect(() => {
        const enabledIndex = field.choices.findIndex(choice => choice.enabled);
        if (enabledIndex !== -1) {
            const newSelected = enabledIndex + 1;
            if (newSelected !== selectedOption) {
                setSelectedOption(newSelected);
                setValue(field.key, enabledIndex);
            }
        }

        // Initialize inline values from each choice's first property
        const initial: { [index: number]: string } = {};
        field.choices.forEach((choice, index) => {
            const firstEntry = getFirstProperty(choice);
            if (firstEntry) {
                const [, prop] = firstEntry;
                initial[index] = (prop.value as string) ?? prop.items?.[0] ?? "";
            }
        });
        setInlineValues(initial);
    }, [field.choices]);

    // When selected option or inline value changes, rebuild dynamic fields
    useEffect(() => {
        const realIndex = selectedOption - 1;
        const choice = field.choices[realIndex];
        if (!choice) return;

        const entries = Object.entries(choice.properties ?? {}) as [string, PropertyModel][];
        if (entries.length === 0) {
            setDynamicFields([]);
            return;
        }

        const [firstKey, firstProp] = entries[0];
        const inlineVal = inlineValues[realIndex];
        const fields: FormField[] = [];

        // If the inline property has nested properties keyed by value (e.g.
        // per-listener config), render those as read-only fields.
        const fieldType = getPrimaryInputType(firstProp.types)?.fieldType;
        if (fieldType === "SINGLE_SELECT" && firstProp.properties && inlineVal) {
            const nested = firstProp.properties[inlineVal] as PropertyModel;
            if (nested?.properties) {
                fields.push(...convertConfig(nested));
            }
        }

        // Remaining properties (after the first / inline one)
        for (let i = 1; i < entries.length; i++) {
            const [key, prop] = entries[i];
            fields.push(propertyToFormField(key, prop));
        }

        setDynamicFields(fields);

        // Register form values for all properties
        // For the first (inline) property, use the tracked inline value to avoid overwriting user edits
        entries.forEach(([propKey, propValue], idx) => {
            if (idx === 0 && inlineValues[realIndex] !== undefined) {
                setValue(propKey, inlineValues[realIndex]);
            } else if (propValue.value !== undefined) {
                setValue(propKey, propValue.value);
            }
        });
    }, [selectedOption, inlineValues]);

    // ── helpers ──────────────────────────────────────────────────────────

    function getFirstProperty(choice: PropertyModel): [string, PropertyModel] | undefined {
        const entries = Object.entries(choice.properties ?? {});
        return entries.length > 0 ? [entries[0][0], entries[0][1] as PropertyModel] : undefined;
    }

    function propertyToFormField(key: string, prop: PropertyModel): FormField {
        const fieldType = getPrimaryInputType(prop.types)?.fieldType;
        let items: string[] | undefined;
        if (fieldType === "MULTIPLE_SELECT" || fieldType === "SINGLE_SELECT") {
            items = prop.items;
        }
        return {
            key,
            label: prop.metadata?.label || key.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, s => s.toUpperCase()),
            type: fieldType,
            documentation: prop.metadata?.description || "",
            types: prop.types,
            editable: prop.editable ?? true,
            enabled: prop.enabled ?? true,
            optional: prop.optional,
            value: prop.value,
            advanced: prop.advanced,
            diagnostics: [],
            items,
            choices: prop.choices,
            placeholder: prop.placeholder,
            defaultValue: prop.defaultValue as string,
        } as FormField;
    }

    function convertConfig(model: PropertyModel): FormField[] {
        const fields: FormField[] = [];
        for (const [key, prop] of Object.entries(model.properties ?? {})) {
            fields.push(propertyToFormField(key, prop as PropertyModel));
        }
        return fields;
    }

    // ── inline widget renderer ──────────────────────────────────────────

    function renderInlineWidget(
        propKey: string,
        prop: PropertyModel,
        choiceIndex: number,
        isActive: boolean,
    ): React.ReactNode {
        const fieldType = getPrimaryInputType(prop.types)?.fieldType;
        const currentValue = inlineValues[choiceIndex] ?? prop.value ?? prop.items?.[0] ?? "";

        if (fieldType === "SINGLE_SELECT" && prop.items?.length > 0) {
            return (
                <Dropdown
                    id={propKey}
                    items={prop.items.map(item => ({ id: item, content: item, value: item }))}
                    value={currentValue}
                    disabled={!isActive}
                    sx={{ width: "100%", minWidth: "120px" }}
                    containerSx={{ width: "100%" }}
                    onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                        const val = e.target.value;
                        setInlineValues(prev => ({ ...prev, [choiceIndex]: val }));
                        setValue(propKey, val);
                    }}
                />
            );
        }

        // Default: text input
        return (
            <TextField
                id={propKey}
                value={currentValue}
                placeholder={prop.placeholder}
                disabled={!isActive}
                sx={{ width: "100%", minWidth: "120px" }}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const val = e.target.value;
                    setInlineValues(prev => ({ ...prev, [choiceIndex]: val }));
                    setValue(propKey, val);
                }}
            />
        );
    }

    // ── render ──────────────────────────────────────────────────────────

    const radioOptions = field.choices.map((choice, index) => {
        const firstEntry = getFirstProperty(choice);
        const isActive = selectedOption === index + 1;
        const isDisabled = !choice.enabled && (!choice.properties || Object.keys(choice.properties).length === 0);

        return {
            id: index.toString(),
            value: index + 1,
            content: firstEntry ? (
                <InlineRow>
                    <InlineLabel>{choice.metadata.label}</InlineLabel>
                    <InlineWidgetContainer
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                        onMouseDown={(e: React.MouseEvent) => e.stopPropagation()}
                    >
                        {renderInlineWidget(firstEntry[0], firstEntry[1], index, isActive)}
                    </InlineWidgetContainer>
                </InlineRow>
            ) : (
                choice.metadata.label
            ),
            disabled: isDisabled,
        };
    });

    return (
        <Form>
            <RadioButtonGroup
                id={`inline-choice-${field.key}`}
                label={field.documentation}
                defaultValue={selectedOption}
                defaultChecked={true}
                value={selectedOption}
                options={radioOptions}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const checkedValue = Number(e.target.value);
                    const realValue = checkedValue - 1;
                    const choice = field.choices[realValue];
                    if (choice && !choice.enabled && (!choice.properties || Object.keys(choice.properties).length === 0)) {
                        return;
                    }
                    setSelectedOption(checkedValue);
                    setValue(field.key, realValue);
                    clearErrors();
                }}
            />

            {dynamicFields.length > 0 && (
                <FormSection>
                    {dynamicFields
                        .filter(dfield => field.advanced || !dfield.advanced)
                        .map((dfield, index) => (
                            <FieldFactory
                                key={dfield.key}
                                field={dfield}
                                autoFocus={index === 0}
                                recordTypeFields={recordTypeFields}
                            />
                        ))}
                </FormSection>
            )}
        </Form>
    );
}
