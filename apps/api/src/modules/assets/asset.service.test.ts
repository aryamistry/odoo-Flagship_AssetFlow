import { describe, expect, it } from "vitest";
import { validateCategoryFields } from "./asset.service.js";

const definitions = [{ id: "capacity", fieldType: "INTEGER", isRequired: true, optionsJson: null, validationJson: null }, { id: "fuel", fieldType: "SELECT", isRequired: false, optionsJson: ["Petrol", "Diesel"], validationJson: null }];
describe("category field validation", () => {
  it("accepts typed values from the selected category", () => expect(() => validateCategoryFields(definitions, [{ fieldDefinitionId: "capacity", value: 8 }, { fieldDefinitionId: "fuel", value: "Diesel" }])).not.toThrow());
  it("rejects a missing required value", () => expect(() => validateCategoryFields(definitions, [])).toThrow(/required category field/i));
  it("rejects unknown field definitions", () => expect(() => validateCategoryFields(definitions, [{ fieldDefinitionId: "capacity", value: 8 }, { fieldDefinitionId: "other", value: "x" }])).toThrow(/does not belong/i));
});
