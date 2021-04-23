package main

import (
	"github.com/aws/aws-lambda-go/lambda"
	"github.com/greymd/ojichat/generator"
)

type Input struct {
	TargetName       string `json:"targetName"`
	EmojiNum         int    `json:"emojiNum"`
	PunctuationLevel int    `json:"punctuationLevel"`
}

type Output struct {
	Message string `json:"message"`
}

func handle(input Input) (output Output, error error) {
	config := generator.Config{
		TargetName:       input.TargetName,
		EmojiNum:         input.EmojiNum,
		PunctuationLevel: input.PunctuationLevel,
	}
	message, err := generator.Start(config)
	if err != nil {
		return Output{}, err
	}
	return Output{
		Message: message,
	}, nil
}

func main() {
	lambda.Start(handle)
}
