using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace LinhaZero.Core.Json;

// The upstream files are not always consistent: IPMA writes -99 for "no reading", and fogos.pt sends some numbers as
// strings and some ids as numbers. These converters read such a field as null instead of rejecting the whole file.

/// <summary>An IPMA reading: a number, with -99 (and anything that is not a number) meaning "no reading".</summary>
public sealed class IpmaReadingConverter : JsonConverter<double?>
{
    private const double Missing = -99.0;

    public override bool HandleNull => true;

    public override double? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        if (reader.TokenType != JsonTokenType.Number)
        {
            reader.Skip();
            return null;
        }

        var value = reader.GetDouble();
        return value == Missing ? null : value;
    }

    public override void Write(Utf8JsonWriter writer, double? value, JsonSerializerOptions options) => WriteNumber(writer, value);

    internal static void WriteNumber(Utf8JsonWriter writer, double? value)
    {
        if (value is null)
        {
            writer.WriteNullValue();
        }
        else
        {
            writer.WriteNumberValue(value.Value);
        }
    }
}

/// <summary>A number, or a string holding a number; anything else is null.</summary>
public sealed class LenientNumberConverter : JsonConverter<double?>
{
    public override bool HandleNull => true;

    public override double? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            case JsonTokenType.Number:
                return reader.GetDouble();
            case JsonTokenType.String:
                var text = reader.GetString();
                return double.TryParse(text, NumberStyles.Float, CultureInfo.InvariantCulture, out var value) ? value : null;
            default:
                reader.Skip();
                return null;
        }
    }

    public override void Write(Utf8JsonWriter writer, double? value, JsonSerializerOptions options) =>
        IpmaReadingConverter.WriteNumber(writer, value);
}

/// <summary>A string, or a number kept as its text ("id": 20261476150 becomes "20261476150"); anything else is null.</summary>
public sealed class LenientStringConverter : JsonConverter<string?>
{
    public override bool HandleNull => true;

    public override string? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            case JsonTokenType.String:
                return reader.GetString();
            case JsonTokenType.Number:
                return Encoding.UTF8.GetString(reader.ValueSpan);
            default:
                reader.Skip();
                return null;
        }
    }

    public override void Write(Utf8JsonWriter writer, string? value, JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
        }
        else
        {
            writer.WriteStringValue(value);
        }
    }
}

/// <summary>true or false; anything else is null.</summary>
public sealed class LenientBooleanConverter : JsonConverter<bool?>
{
    public override bool HandleNull => true;

    public override bool? Read(ref Utf8JsonReader reader, Type typeToConvert, JsonSerializerOptions options)
    {
        switch (reader.TokenType)
        {
            case JsonTokenType.True:
                return true;
            case JsonTokenType.False:
                return false;
            default:
                reader.Skip();
                return null;
        }
    }

    public override void Write(Utf8JsonWriter writer, bool? value, JsonSerializerOptions options)
    {
        if (value is null)
        {
            writer.WriteNullValue();
        }
        else
        {
            writer.WriteBooleanValue(value.Value);
        }
    }
}
