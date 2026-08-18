#[derive(Clone, Copy)]
enum CommandAction {
    Punctuation(char),
    Newlines(usize),
    RemoveLastWord,
    RemoveClause,
    Open(char),
    Close(char),
    Join(&'static str),
    Bullet,
    NumberedItem,
    NextItem,
    LiteralOn,
    LiteralOff,
}

struct SpokenCommand {
    languages: &'static [&'static str],
    phrase: &'static [&'static str],
    action: CommandAction,
}

const COMMANDS: &[SpokenCommand] = &[
    SpokenCommand {
        languages: &["en"],
        phrase: &["end", "literal", "mode"],
        action: CommandAction::LiteralOff,
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["fin", "modo", "literal"],
        action: CommandAction::LiteralOff,
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["fim", "modo", "literal"],
        action: CommandAction::LiteralOff,
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["literal", "mode"],
        action: CommandAction::LiteralOn,
    },
    SpokenCommand {
        languages: &["es", "pt"],
        phrase: &["modo", "literal"],
        action: CommandAction::LiteralOn,
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["numbered", "item"],
        action: CommandAction::NumberedItem,
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["elemento", "numerado"],
        action: CommandAction::NumberedItem,
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["item", "numerado"],
        action: CommandAction::NumberedItem,
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["bullet", "point"],
        action: CommandAction::Bullet,
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["punto", "de", "lista"],
        action: CommandAction::Bullet,
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["ponto", "de", "lista"],
        action: CommandAction::Bullet,
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["next", "item"],
        action: CommandAction::NextItem,
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["siguiente", "elemento"],
        action: CommandAction::NextItem,
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["próximo", "item"],
        action: CommandAction::NextItem,
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["open", "parenthesis"],
        action: CommandAction::Open('('),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["abre", "paréntesis"],
        action: CommandAction::Open('('),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["abre", "parênteses"],
        action: CommandAction::Open('('),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["close", "parenthesis"],
        action: CommandAction::Close(')'),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["cierra", "paréntesis"],
        action: CommandAction::Close(')'),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["fecha", "parênteses"],
        action: CommandAction::Close(')'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["open", "bracket"],
        action: CommandAction::Open('['),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["abre", "corchete"],
        action: CommandAction::Open('['),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["abre", "colchete"],
        action: CommandAction::Open('['),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["close", "bracket"],
        action: CommandAction::Close(']'),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["cierra", "corchete"],
        action: CommandAction::Close(']'),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["fecha", "colchete"],
        action: CommandAction::Close(']'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["at", "sign"],
        action: CommandAction::Join("@"),
    },
    SpokenCommand {
        languages: &["es", "pt"],
        phrase: &["arroba"],
        action: CommandAction::Join("@"),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["dot"],
        action: CommandAction::Join("."),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["punto", "sin", "espacio"],
        action: CommandAction::Join("."),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["ponto", "sem", "espaço"],
        action: CommandAction::Join("."),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["slash"],
        action: CommandAction::Join("/"),
    },
    SpokenCommand {
        languages: &["es", "pt"],
        phrase: &["barra"],
        action: CommandAction::Join("/"),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["signo", "de", "interrogación"],
        action: CommandAction::Punctuation('?'),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["signo", "de", "exclamación"],
        action: CommandAction::Punctuation('!'),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["ponto", "de", "interrogação"],
        action: CommandAction::Punctuation('?'),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["ponto", "de", "exclamação"],
        action: CommandAction::Punctuation('!'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["exclamation", "point"],
        action: CommandAction::Punctuation('!'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["exclamation", "mark"],
        action: CommandAction::Punctuation('!'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["question", "mark"],
        action: CommandAction::Punctuation('?'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["full", "stop"],
        action: CommandAction::Punctuation('.'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["new", "paragraph"],
        action: CommandAction::Newlines(2),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["nuevo", "párrafo"],
        action: CommandAction::Newlines(2),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["novo", "parágrafo"],
        action: CommandAction::Newlines(2),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["new", "line"],
        action: CommandAction::Newlines(1),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["nueva", "línea"],
        action: CommandAction::Newlines(1),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["nova", "linha"],
        action: CommandAction::Newlines(1),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["punto", "y", "coma"],
        action: CommandAction::Punctuation(';'),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["ponto", "e", "vírgula"],
        action: CommandAction::Punctuation(';'),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["dos", "puntos"],
        action: CommandAction::Punctuation(':'),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["dois", "pontos"],
        action: CommandAction::Punctuation(':'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["no", "wait"],
        action: CommandAction::RemoveLastWord,
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["i", "mean"],
        action: CommandAction::RemoveLastWord,
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["mejor", "dicho"],
        action: CommandAction::RemoveLastWord,
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["quise", "decir"],
        action: CommandAction::RemoveLastWord,
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["quer", "dizer"],
        action: CommandAction::RemoveLastWord,
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["melhor", "dizendo"],
        action: CommandAction::RemoveLastWord,
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["scratch", "that"],
        action: CommandAction::RemoveClause,
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["borra", "eso"],
        action: CommandAction::RemoveClause,
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["apaga", "isso"],
        action: CommandAction::RemoveClause,
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["comma"],
        action: CommandAction::Punctuation(','),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["period"],
        action: CommandAction::Punctuation('.'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["colon"],
        action: CommandAction::Punctuation(':'),
    },
    SpokenCommand {
        languages: &["en"],
        phrase: &["semicolon"],
        action: CommandAction::Punctuation(';'),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["coma"],
        action: CommandAction::Punctuation(','),
    },
    SpokenCommand {
        languages: &["es"],
        phrase: &["punto"],
        action: CommandAction::Punctuation('.'),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["vírgula"],
        action: CommandAction::Punctuation(','),
    },
    SpokenCommand {
        languages: &["pt"],
        phrase: &["ponto"],
        action: CommandAction::Punctuation('.'),
    },
];

fn normalized_token(token: &str) -> String {
    token
        .trim_matches(|character: char| !character.is_alphanumeric())
        .to_lowercase()
}

fn language_code(language: &str) -> Option<&str> {
    let language = language.trim();
    if language.is_empty() || language.eq_ignore_ascii_case("auto") {
        return None;
    }
    language
        .get(..2)
        .map(|value| value.to_ascii_lowercase())
        .and_then(|value| match value.as_str() {
            "en" => Some("en"),
            "es" => Some("es"),
            "pt" => Some("pt"),
            _ => None,
        })
}

fn number_atom(token: &str, language: &str) -> Option<(u32, u32)> {
    if let Ok(value) = token.parse::<u32>() {
        return Some((value, 1));
    }
    let value = match (language, token) {
        ("en", "zero") | ("es", "cero") | ("pt", "zero") => 0,
        ("en", "one") | ("es", "uno" | "un" | "una") | ("pt", "um" | "uma") => 1,
        ("en", "two") | ("es", "dos") | ("pt", "dois" | "duas") => 2,
        ("en", "three") | ("es", "tres") | ("pt", "três") => 3,
        ("en", "four") | ("es", "cuatro") | ("pt", "quatro") => 4,
        ("en", "five") | ("es", "cinco") | ("pt", "cinco") => 5,
        ("en", "six") | ("es", "seis") | ("pt", "seis") => 6,
        ("en", "seven") | ("es", "siete") | ("pt", "sete") => 7,
        ("en", "eight") | ("es", "ocho") | ("pt", "oito") => 8,
        ("en", "nine") | ("es", "nueve") | ("pt", "nove") => 9,
        ("en", "ten") | ("es", "diez") | ("pt", "dez") => 10,
        ("en", "eleven") | ("es", "once") | ("pt", "onze") => 11,
        ("en", "twelve") | ("es", "doce") | ("pt", "doze") => 12,
        ("en", "thirteen") | ("es", "trece") | ("pt", "treze") => 13,
        ("en", "fourteen") | ("es", "catorce") | ("pt", "catorze" | "quatorze") => 14,
        ("en", "fifteen") | ("es", "quince") | ("pt", "quinze") => 15,
        ("en", "sixteen") | ("es", "dieciséis") | ("pt", "dezesseis" | "dezasseis") => 16,
        ("en", "seventeen") | ("es", "diecisiete") | ("pt", "dezessete" | "dezassete") => 17,
        ("en", "eighteen") | ("es", "dieciocho") | ("pt", "dezoito") => 18,
        ("en", "nineteen") | ("es", "diecinueve") | ("pt", "dezenove") => 19,
        ("en", "twenty") | ("es", "veinte") | ("pt", "vinte") => 20,
        ("es", "veintiuno" | "veintiún" | "veintiuna") => 21,
        ("es", "veintidós") => 22,
        ("es", "veintitrés") => 23,
        ("es", "veinticuatro") => 24,
        ("es", "veinticinco") => 25,
        ("es", "veintiséis") => 26,
        ("es", "veintisiete") => 27,
        ("es", "veintiocho") => 28,
        ("es", "veintinueve") => 29,
        ("en", "thirty") | ("es", "treinta") | ("pt", "trinta") => 30,
        ("en", "forty") | ("es", "cuarenta") | ("pt", "quarenta") => 40,
        ("en", "fifty") | ("es", "cincuenta") | ("pt", "cinquenta") => 50,
        ("en", "sixty") | ("es", "sesenta") | ("pt", "sessenta") => 60,
        ("en", "seventy") | ("es", "setenta") | ("pt", "setenta") => 70,
        ("en", "eighty") | ("es", "ochenta") | ("pt", "oitenta") => 80,
        ("en", "ninety") | ("es", "noventa") | ("pt", "noventa") => 90,
        ("en", "hundred") | ("es", "cien" | "ciento") | ("pt", "cem" | "cento") => {
            return Some((0, 100));
        }
        ("en", "thousand") | ("es" | "pt", "mil") => return Some((0, 1_000)),
        _ => return None,
    };
    Some((value, 1))
}

fn is_number_connector(token: &str, language: &str) -> bool {
    matches!((language, token), ("en", "and") | ("es", "y") | ("pt", "e"))
}

fn parse_number_exact(tokens: &[String], language: &str) -> Option<u32> {
    if tokens.is_empty() {
        return None;
    }
    let mut total = 0_u32;
    let mut current = 0_u32;
    let mut saw_number = false;
    for (index, token) in tokens.iter().enumerate() {
        if is_number_connector(token, language) {
            if !saw_number || index + 1 == tokens.len() {
                return None;
            }
            continue;
        }
        let (value, scale) = number_atom(token, language)?;
        if scale > 1 && !saw_number {
            return None;
        }
        saw_number = true;
        match scale {
            100 => current = current.max(1).checked_mul(100)?,
            1_000 => {
                total = total.checked_add(current.max(1).checked_mul(1_000)?)?;
                current = 0;
            }
            _ => current = current.checked_add(value)?,
        }
    }
    saw_number.then(|| total + current)
}

fn number_prefix_len(tokens: &[String], start: usize, language: &str) -> usize {
    let mut end = start;
    while end < tokens.len() && end - start < 10 {
        let token = &tokens[end];
        if number_atom(token, language).is_some() || is_number_connector(token, language) {
            end += 1;
        } else {
            break;
        }
    }
    while end > start && is_number_connector(&tokens[end - 1], language) {
        end -= 1;
    }
    end - start
}

fn month_number(token: &str, language: &str) -> Option<u32> {
    let month = match (language, token) {
        ("en", "january") | ("es", "enero") | ("pt", "janeiro") => 1,
        ("en", "february") | ("es", "febrero") | ("pt", "fevereiro") => 2,
        ("en", "march") | ("es", "marzo") | ("pt", "março") => 3,
        ("en", "april") | ("es", "abril") | ("pt", "abril") => 4,
        ("en", "may") | ("es", "mayo") | ("pt", "maio") => 5,
        ("en", "june") | ("es", "junio") | ("pt", "junho") => 6,
        ("en", "july") | ("es", "julio") | ("pt", "julho") => 7,
        ("en", "august") | ("es", "agosto") | ("pt", "agosto") => 8,
        ("en", "september") | ("es", "septiembre") | ("pt", "setembro") => 9,
        ("en", "october") | ("es", "octubre") | ("pt", "outubro") => 10,
        ("en", "november") | ("es", "noviembre") | ("pt", "novembro") => 11,
        ("en", "december") | ("es", "diciembre") | ("pt", "dezembro") => 12,
        _ => return None,
    };
    Some(month)
}

fn match_date(tokens: &[String], start: usize, language: &str) -> Option<(usize, String)> {
    if language == "en" {
        let month = month_number(tokens.get(start)?, language)?;
        let length = number_prefix_len(tokens, start + 1, language);
        for split in (1..length).rev() {
            let Some(day) = parse_number_exact(&tokens[start + 1..start + 1 + split], language)
            else {
                continue;
            };
            let Some(year) =
                parse_number_exact(&tokens[start + 1 + split..start + 1 + length], language)
            else {
                continue;
            };
            if (1..=31).contains(&day) && (1_000..=9_999).contains(&year) {
                return Some((1 + length, format!("{year:04}-{month:02}-{day:02}")));
            }
        }
        return None;
    }

    let first_de = (start + 1..tokens.len().min(start + 6)).find(|&i| tokens[i] == "de")?;
    let day = parse_number_exact(&tokens[start..first_de], language)?;
    let month = month_number(tokens.get(first_de + 1)?, language)?;
    if tokens.get(first_de + 2).map(String::as_str) != Some("de") {
        return None;
    }
    let year_start = first_de + 3;
    let year_length = number_prefix_len(tokens, year_start, language);
    let year = parse_number_exact(&tokens[year_start..year_start + year_length], language)?;
    ((1..=31).contains(&day) && (1_000..=9_999).contains(&year)).then(|| {
        (
            year_start + year_length - start,
            format!("{year:04}-{month:02}-{day:02}"),
        )
    })
}

fn match_time(tokens: &[String], start: usize, language: &str) -> Option<(usize, String)> {
    let marker = (start + 2..tokens.len().min(start + 7))
        .find(|&index| matches!(tokens[index].as_str(), "am" | "pm"))?;
    for split in start + 1..marker {
        let minute_start = if is_number_connector(&tokens[split], language) {
            split + 1
        } else {
            split
        };
        let hour = parse_number_exact(&tokens[start..split], language)?;
        let minute = parse_number_exact(&tokens[minute_start..marker], language)?;
        if (1..=12).contains(&hour) && minute <= 59 {
            return Some((
                marker - start + 1,
                format!("{hour}:{minute:02} {}", tokens[marker].to_uppercase()),
            ));
        }
    }
    None
}

fn currency_symbol(token: &str, language: &str) -> Option<&'static str> {
    match (language, token) {
        ("en", "dollar" | "dollars")
        | ("es", "dólar" | "dólares" | "dolar" | "dolares" | "peso" | "pesos") => Some("$"),
        ("pt", "dólar" | "dólares" | "dolar" | "dolares") => Some("US$"),
        ("pt", "real" | "reais") => Some("R$"),
        (_, "euro" | "euros") => Some("€"),
        ("en", "pound" | "pounds") => Some("£"),
        _ => None,
    }
}

fn match_entity(tokens: &[String], start: usize, language: &str) -> Option<(usize, String)> {
    if let Some(date) = match_date(tokens, start, language) {
        return Some(date);
    }
    if let Some(time) = match_time(tokens, start, language) {
        return Some(time);
    }
    let number_length = number_prefix_len(tokens, start, language);
    if number_length == 0 {
        return None;
    }
    let value = parse_number_exact(&tokens[start..start + number_length], language)?;
    if let Some(symbol) = tokens
        .get(start + number_length)
        .and_then(|unit| currency_symbol(unit, language))
    {
        return Some((number_length + 1, format!("{symbol}{value}")));
    }
    Some((number_length, value.to_string()))
}

fn matches_command(
    normalized: &[String],
    index: usize,
    language: Option<&str>,
) -> Option<(usize, CommandAction)> {
    COMMANDS.iter().find_map(|command| {
        if language.is_some_and(|code| !command.languages.contains(&code)) {
            return None;
        }
        let end = index.checked_add(command.phrase.len())?;
        let candidate = normalized.get(index..end)?;
        candidate
            .iter()
            .map(String::as_str)
            .eq(command.phrase.iter().copied())
            .then_some((command.phrase.len(), command.action))
    })
}

fn trim_output(output: &mut String) {
    output.truncate(output.trim_end().len());
}

fn remove_last_word(output: &mut String) {
    trim_output(output);
    let start = output
        .char_indices()
        .rev()
        .find(|(_, character)| character.is_whitespace())
        .map(|(index, character)| index + character.len_utf8())
        .unwrap_or(0);
    output.truncate(start);
    trim_output(output);
}

fn remove_current_clause(output: &mut String) {
    trim_output(output);
    let keep = output
        .char_indices()
        .rev()
        .find(|(_, character)| matches!(character, '.' | '!' | '?' | '\n'))
        .map(|(index, character)| index + character.len_utf8())
        .unwrap_or(0);
    output.truncate(keep);
    trim_output(output);
}

#[derive(Clone, Copy)]
enum ListKind {
    Bullet,
    Numbered,
}

fn start_list_item(output: &mut String, kind: ListKind, number: usize) {
    trim_output(output);
    if !output.is_empty() {
        output.push('\n');
    }
    match kind {
        ListKind::Bullet => output.push_str("- "),
        ListKind::Numbered => output.push_str(&format!("{number}. ")),
    }
}

fn apply_action(
    output: &mut String,
    action: CommandAction,
    list_kind: &mut Option<ListKind>,
    list_number: &mut usize,
    join_next: &mut bool,
) {
    match action {
        CommandAction::Punctuation(mark) => {
            trim_output(output);
            if !output.is_empty() && !output.ends_with(mark) {
                output.push(mark);
            }
        }
        CommandAction::Newlines(count) => {
            trim_output(output);
            if !output.is_empty() {
                output.push_str(&"\n".repeat(count));
            }
        }
        CommandAction::RemoveLastWord => remove_last_word(output),
        CommandAction::RemoveClause => remove_current_clause(output),
        CommandAction::Open(mark) => {
            if !output.is_empty() && !output.ends_with(char::is_whitespace) {
                output.push(' ');
            }
            output.push(mark);
            *join_next = true;
        }
        CommandAction::Close(mark) => {
            trim_output(output);
            output.push(mark);
        }
        CommandAction::Join(value) => {
            trim_output(output);
            output.push_str(value);
            *join_next = true;
        }
        CommandAction::Bullet => {
            *list_kind = Some(ListKind::Bullet);
            *list_number = 0;
            start_list_item(output, ListKind::Bullet, 0);
        }
        CommandAction::NumberedItem => {
            if !matches!(list_kind, Some(ListKind::Numbered)) {
                *list_number = 0;
            }
            *list_kind = Some(ListKind::Numbered);
            *list_number += 1;
            start_list_item(output, ListKind::Numbered, *list_number);
        }
        CommandAction::NextItem => match *list_kind {
            Some(ListKind::Numbered) => {
                *list_number += 1;
                start_list_item(output, ListKind::Numbered, *list_number);
            }
            _ => {
                *list_kind = Some(ListKind::Bullet);
                start_list_item(output, ListKind::Bullet, 0);
            }
        },
        CommandAction::LiteralOn | CommandAction::LiteralOff => {}
    }
}

pub(crate) fn apply_spoken_formatting(transcript: &str, language: &str) -> String {
    let tokens: Vec<&str> = transcript.split_whitespace().collect();
    if tokens.is_empty() {
        return String::new();
    }
    let normalized: Vec<String> = tokens.iter().map(|token| normalized_token(token)).collect();
    let language = language_code(language);
    let mut output = String::with_capacity(transcript.len());
    let mut index = 0;
    let mut literal_mode = false;
    let mut list_kind = None;
    let mut list_number = 0;
    let mut join_next = false;

    while index < tokens.len() {
        if let Some((consumed, action)) = matches_command(&normalized, index, language) {
            if literal_mode {
                if matches!(action, CommandAction::LiteralOff) {
                    literal_mode = false;
                    index += consumed;
                    continue;
                }
            } else {
                if matches!(action, CommandAction::LiteralOn) {
                    literal_mode = true;
                    index += consumed;
                    continue;
                }
                apply_action(
                    &mut output,
                    action,
                    &mut list_kind,
                    &mut list_number,
                    &mut join_next,
                );
                index += consumed;
                continue;
            }
        }

        if !literal_mode {
            if let Some(language) = language {
                if let Some((consumed, replacement)) = match_entity(&normalized, index, language) {
                    if !output.is_empty() && !output.ends_with(char::is_whitespace) && !join_next {
                        output.push(' ');
                    }
                    output.push_str(&replacement);
                    join_next = false;
                    index += consumed;
                    continue;
                }
            }
        }

        if !output.is_empty() && !output.ends_with(char::is_whitespace) && !join_next {
            output.push(' ');
        }
        output.push_str(tokens[index]);
        join_next = false;
        index += 1;
    }

    output.trim().to_string()
}

#[cfg(test)]
mod tests {
    use super::apply_spoken_formatting;

    #[test]
    fn matches_the_cross_platform_conformance_corpus() {
        let corpus = include_str!("../../../../fixtures/spoken-formatting.tsv");
        for (line_number, line) in corpus.lines().enumerate() {
            if line.is_empty() || line.starts_with('#') {
                continue;
            }
            let fields = line.split('\t').collect::<Vec<_>>();
            assert_eq!(fields.len(), 3, "invalid corpus row {}", line_number + 1);
            assert_eq!(
                apply_spoken_formatting(fields[1], fields[0]),
                fields[2].replace("\\n", "\n"),
                "corpus row {}",
                line_number + 1
            );
        }
    }

    #[test]
    fn formats_english_punctuation_and_paragraphs() {
        assert_eq!(
            apply_spoken_formatting(
                "Hello comma world period new paragraph How are you question mark",
                "en-US"
            ),
            "Hello, world.\n\nHow are you?"
        );
    }

    #[test]
    fn formats_spanish_and_portuguese_commands() {
        assert_eq!(
            apply_spoken_formatting("Hola coma mundo nueva línea seguimos punto", "es"),
            "Hola, mundo\nseguimos."
        );
        assert_eq!(
            apply_spoken_formatting("Olá vírgula mundo nova linha seguimos ponto", "pt-BR"),
            "Olá, mundo\nseguimos."
        );
    }

    #[test]
    fn replaces_the_last_word_after_an_explicit_correction() {
        assert_eq!(
            apply_spoken_formatting("Meet me at five no wait six", "en"),
            "Meet me at 6"
        );
        assert_eq!(
            apply_spoken_formatting("Llegamos el jueves mejor dicho viernes", "es"),
            "Llegamos el viernes"
        );
        assert_eq!(
            apply_spoken_formatting("Chegamos quinta quer dizer sexta", "pt"),
            "Chegamos sexta"
        );
    }

    #[test]
    fn scratch_that_removes_only_the_current_clause() {
        assert_eq!(
            apply_spoken_formatting(
                "The title is final period add a subtitle scratch that publish it",
                "en"
            ),
            "The title is final. publish it"
        );
    }

    #[test]
    fn a_specific_language_does_not_apply_other_language_commands() {
        assert_eq!(
            apply_spoken_formatting("Hola comma mundo", "es"),
            "Hola comma mundo"
        );
    }

    #[test]
    fn formats_lists_pairs_emails_and_urls() {
        assert_eq!(
            apply_spoken_formatting(
                "Shopping bullet point milk next item water next item coffee",
                "en"
            ),
            "Shopping\n- milk\n- water\n- coffee"
        );
        assert_eq!(
            apply_spoken_formatting(
                "Steps numbered item install next item test next item ship",
                "en"
            ),
            "Steps\n1. install\n2. test\n3. ship"
        );
        assert_eq!(
            apply_spoken_formatting("use open parenthesis beta close parenthesis", "en"),
            "use (beta)"
        );
        assert_eq!(
            apply_spoken_formatting("james at sign telepatia dot ai slash pricing", "en"),
            "james@telepatia.ai/pricing"
        );
    }

    #[test]
    fn literal_mode_preserves_spoken_commands() {
        assert_eq!(
            apply_spoken_formatting(
                "type literal mode comma new line period end literal mode period",
                "en"
            ),
            "type comma new line period."
        );
    }

    #[test]
    fn normalizes_bounded_numbers_dates_times_and_currencies() {
        assert_eq!(
            apply_spoken_formatting(
                "Budget twenty five dollars on July nineteen two thousand twenty six at three thirty pm",
                "en"
            ),
            "Budget $25 on 2026-07-19 at 3:30 PM"
        );
        assert_eq!(
            apply_spoken_formatting(
                "Presupuesto veinticinco dólares el diecinueve de julio de dos mil veintiséis a las tres treinta pm",
                "es"
            ),
            "Presupuesto $25 el 2026-07-19 a las 3:30 PM"
        );
        assert_eq!(
            apply_spoken_formatting(
                "Orçamento vinte e cinco reais em dezenove de julho de dois mil e vinte e seis às três e trinta pm",
                "pt"
            ),
            "Orçamento R$25 em 2026-07-19 às 3:30 PM"
        );
        assert_eq!(
            apply_spoken_formatting("I need one hundred twenty three items", "en"),
            "I need 123 items"
        );
    }
}
